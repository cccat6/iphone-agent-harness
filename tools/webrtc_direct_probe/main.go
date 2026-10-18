// Local transport experiment only. No HTTP signaling, cloud, relay or HID.
package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"errors"
	"flag"
	"fmt"
	"log"
	"math/big"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/pion/ice/v4"
	"github.com/pion/logging"
	"github.com/pion/stun/v3"
	"github.com/pion/webrtc/v4"
)

const prefix = "libp2p+webrtc+v2/"

var iceChars = regexp.MustCompile(`^[a-zA-Z0-9+/]+$`)
var nonceChars = regexp.MustCompile(`^[a-zA-Z0-9._:-]{1,80}$`)

type publicConfig struct {
	Version           int    `json:"version"`
	IP                string `json:"ip"`
	Host              string `json:"host"`
	Port              int    `json:"port"`
	Fingerprint       string `json:"fingerprint"`
	FingerprintSHA256 string `json:"fingerprintSHA256"`
	Transport         string `json:"transport"`
	MaxMessageBytes   int    `json:"maxMessageBytes"`
	PhoneInputSent    bool   `json:"phoneInputSent"`
}

func certificate(dir string) (*webrtc.Certificate, error) {
	certPath, keyPath := filepath.Join(dir, "certificate.pem"), filepath.Join(dir, "private-key.pem")
	cb, ce := os.ReadFile(certPath)
	kb, ke := os.ReadFile(keyPath)
	if errors.Is(ce, os.ErrNotExist) && errors.Is(ke, os.ErrNotExist) {
		key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			return nil, err
		}
		serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
		if err != nil {
			return nil, err
		}
		now := time.Now()
		tpl := x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: "iPhone Agent transport probe"}, NotBefore: now.Add(-time.Hour), NotAfter: now.Add(13 * 24 * time.Hour), KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth, x509.ExtKeyUsageServerAuth}, BasicConstraintsValid: true}
		der, err := x509.CreateCertificate(rand.Reader, &tpl, &tpl, &key.PublicKey, key)
		if err != nil {
			return nil, err
		}
		kd, err := x509.MarshalECPrivateKey(key)
		if err != nil {
			return nil, err
		}
		cb = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
		kb = pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: kd})
		if err = os.MkdirAll(dir, 0700); err != nil {
			return nil, err
		}
		if err = os.WriteFile(keyPath, kb, 0600); err != nil {
			return nil, err
		}
		if err = os.WriteFile(certPath, cb, 0600); err != nil {
			return nil, err
		}
	} else if ce != nil || ke != nil {
		return nil, errors.New("incomplete test certificate files")
	}
	cp, _ := pem.Decode(cb)
	kp, _ := pem.Decode(kb)
	if cp == nil || kp == nil {
		return nil, errors.New("invalid certificate PEM")
	}
	c, err := x509.ParseCertificate(cp.Bytes)
	if err != nil {
		return nil, err
	}
	k, err := x509.ParseECPrivateKey(kp.Bytes)
	if err != nil {
		return nil, err
	}
	if time.Now().Before(c.NotBefore) || time.Now().After(c.NotAfter) {
		return nil, errors.New("test certificate expired; explicitly renew test files")
	}
	value := webrtc.CertificateFromX509(k, c)
	return &value, nil
}

func credentials(packet []byte) (serverUfrag, clientUfrag, clientPwd string, ok bool) {
	if !stun.IsMessage(packet) || len(packet) > 2048 {
		return
	}
	message := &stun.Message{Raw: packet}
	if message.Decode() != nil || message.Type != stun.BindingRequest {
		return
	}
	var username stun.Username
	if username.GetFrom(message) != nil {
		return
	}
	parts := strings.Split(string(username), ":")
	if len(parts) != 2 {
		return
	}
	serverUfrag, clientUfrag = parts[0], parts[1]
	if !strings.HasPrefix(serverUfrag, prefix) || len(serverUfrag) > 256 || len(clientUfrag) < 4 || len(clientUfrag) > 256 || !iceChars.MatchString(clientUfrag) {
		return
	}
	clientPwd = strings.TrimPrefix(serverUfrag, prefix)
	if len(clientPwd) < 22 || len(clientPwd) > 239 || !iceChars.MatchString(clientPwd) {
		return
	}
	if stun.NewShortTermIntegrity(serverUfrag).Check(message) != nil {
		return
	}
	ok = true
	return
}

func remoteOffer(addr *net.UDPAddr, ufrag, pwd string) string {
	return fmt.Sprintf("v=0\r\no=- 0 0 IN IP4 %s\r\ns=-\r\nt=0 0\r\nm=application %d UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 %s\r\na=mid:0\r\na=setup:active\r\na=ice-ufrag:%s\r\na=ice-pwd:%s\r\na=fingerprint:sha-256 %s\r\na=sctp-port:5000\r\na=max-message-size:16384\r\na=candidate:1 1 UDP 2130706431 %s %d typ host\r\na=end-of-candidates\r\n", addr.IP, addr.Port, addr.IP, ufrag, pwd, strings.TrimSuffix(strings.Repeat("00:", 32), ":"), addr.IP, addr.Port)
}
func syntheticAnswer(ip string, port int, fp, pwd string) string {
	u := prefix + pwd
	return fmt.Sprintf("v=0\r\no=- 0 0 IN IP4 %s\r\ns=-\r\nt=0 0\r\na=ice-lite\r\nm=application %d UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 %s\r\na=mid:0\r\na=ice-ufrag:%s\r\na=ice-pwd:%s\r\na=fingerprint:sha-256 %s\r\na=setup:passive\r\na=sctp-port:5000\r\na=max-message-size:16384\r\na=candidate:1 1 UDP 2130706431 %s %d typ host\r\na=end-of-candidates\r\n", ip, port, ip, u, u, fp, ip, port)
}

type watchedConn struct {
	net.PacketConn
	inspect func([]byte, net.Addr)
}

func (c *watchedConn) ReadFrom(p []byte) (int, net.Addr, error) {
	n, a, e := c.PacketConn.ReadFrom(p)
	if e == nil && c.inspect != nil {
		c.inspect(p[:n], a)
	}
	return n, a, e
}

type peer struct {
	pc     *webrtc.PeerConnection
	number int
	last   atomic.Int64
	echoes atomic.Uint32
	closed bool
}
type server struct {
	mu     sync.Mutex
	peers  map[string]*peer
	mux    *ice.UDPMuxDefault
	cert   *webrtc.Certificate
	next   int
	logger *logging.DefaultLoggerFactory
	ready  chan struct{}
}

func (s *server) drop(key string, p *peer) {
	s.mu.Lock()
	if s.peers[key] != p {
		s.mu.Unlock()
		return
	}
	delete(s.peers, key)
	p.closed = true
	pc := p.pc
	s.mu.Unlock()
	s.mux.RemoveConnByUfrag(key)
	if pc != nil {
		_ = pc.Close()
	}
	log.Printf("peer=%d closed", p.number)
}
func (s *server) inspect(packet []byte, source net.Addr) {
	addr, ok := source.(*net.UDPAddr)
	if !ok || (!addr.IP.IsPrivate() && !addr.IP.IsLoopback()) {
		return
	}
	u, remote, pwd, ok := credentials(packet)
	if !ok {
		return
	}
	s.mu.Lock()
	if _, exists := s.peers[u]; exists || len(s.peers) >= 2 {
		s.mu.Unlock()
		return
	}
	s.next++
	p := &peer{number: s.next}
	p.last.Store(time.Now().UnixNano())
	s.peers[u] = p
	s.mu.Unlock()
	copyAddr := *addr
	copyAddr.IP = append(net.IP(nil), addr.IP...)
	go s.accept(u, remote, pwd, &copyAddr, p)
}
func (s *server) accept(u, remote, pwd string, addr *net.UDPAddr, p *peer) {
	<-s.ready
	fail := func(stage string) { log.Printf("peer=%d failed stage=%s", p.number, stage); s.drop(u, p) }
	engine := webrtc.SettingEngine{LoggerFactory: s.logger}
	engine.SetLite(true)
	engine.SetNetworkTypes([]webrtc.NetworkType{webrtc.NetworkTypeUDP4})
	engine.SetIncludeLoopbackCandidate(true)
	engine.SetICEMulticastDNSMode(ice.MulticastDNSModeDisabled)
	engine.SetICECredentials(u, u)
	engine.SetICEUDPMux(s.mux)
	engine.DisableCertificateFingerprintVerification(true)
	engine.SetICETimeouts(15*time.Second, 25*time.Second, 5*time.Second)
	engine.SetSCTPMaxReceiveBufferSize(65536)
	if engine.SetAnsweringDTLSRole(webrtc.DTLSRoleServer) != nil {
		fail("role")
		return
	}
	api := webrtc.NewAPI(webrtc.WithSettingEngine(engine))
	pc, err := api.NewPeerConnection(webrtc.Configuration{Certificates: []webrtc.Certificate{*s.cert}})
	if err != nil {
		fail("create")
		return
	}
	s.mu.Lock()
	if p.closed {
		s.mu.Unlock()
		_ = pc.Close()
		return
	}
	p.pc = pc
	s.mu.Unlock()
	pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		log.Printf("peer=%d state=%s", p.number, state.String())
		if state == webrtc.PeerConnectionStateFailed || state == webrtc.PeerConnectionStateClosed {
			go s.drop(u, p)
		}
	})
	id := uint16(0)
	yes := true
	dc, err := pc.CreateDataChannel("probe", &webrtc.DataChannelInit{ID: &id, Negotiated: &yes, Ordered: &yes})
	if err != nil {
		fail("channel")
		return
	}
	dc.OnOpen(func() { p.last.Store(time.Now().UnixNano()); log.Printf("peer=%d channel=open", p.number) })
	dc.OnMessage(func(message webrtc.DataChannelMessage) {
		if !message.IsString || len(message.Data) > 512 {
			go s.drop(u, p)
			return
		}
		var value struct {
			Probe bool   `json:"probe"`
			Nonce string `json:"nonce"`
		}
		if json.Unmarshal(message.Data, &value) != nil || !value.Probe || !nonceChars.MatchString(value.Nonce) {
			return
		}
		p.last.Store(time.Now().UnixNano())
		response := map[string]any{"probe": true, "nonce": value.Nonce, "phoneInputSent": false, "transport": "udp"}
		// Inspect the server's actual selected ICE pair, not the browser's stats
		// support or merely the first STUN source address.
		observed := "unknown"
		if pair, pairErr := pc.SCTP().Transport().ICETransport().GetSelectedCandidatePair(); pairErr == nil && pair != nil && pair.Remote != nil {
			observed = net.JoinHostPort(pair.Remote.Address, strconv.Itoa(int(pair.Remote.Port)))
			response["serverPeerAddress"] = observed
		}
		reply, _ := json.Marshal(response)
		if dc.SendText(string(reply)) != nil {
			go s.drop(u, p)
			return
		}
		if p.echoes.Add(1) <= 8 {
			log.Printf("peer=%d probe=echo bytes=%d selectedRemote=%s transport=udp", p.number, len(message.Data), observed)
		}
	})
	if pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: remoteOffer(addr, remote, pwd)}) != nil {
		fail("remote")
		return
	}
	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		fail("answer")
		return
	}
	if pc.SetLocalDescription(answer) != nil {
		fail("local")
		return
	}
	log.Printf("peer=%d accepted stunSource=%s transport=udp", p.number, addr.String())
}

func selfTest(c publicConfig) error {
	engine := webrtc.SettingEngine{}
	engine.SetIncludeLoopbackCandidate(true)
	engine.SetICEMulticastDNSMode(ice.MulticastDNSModeDisabled)
	engine.SetNetworkTypes([]webrtc.NetworkType{webrtc.NetworkTypeUDP4})
	pc, err := webrtc.NewAPI(webrtc.WithSettingEngine(engine)).NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		return err
	}
	defer pc.Close()
	id := uint16(0)
	yes := true
	dc, err := pc.CreateDataChannel("probe", &webrtc.DataChannelInit{ID: &id, Negotiated: &yes, Ordered: &yes})
	if err != nil {
		return err
	}
	done := make(chan error, 1)
	dc.OnOpen(func() {
		if err := dc.SendText(`{"probe":true,"nonce":"desktop-self-test"}`); err != nil {
			done <- err
		}
	})
	dc.OnMessage(func(m webrtc.DataChannelMessage) {
		var v struct {
			Probe             bool   `json:"probe"`
			Nonce             string `json:"nonce"`
			PhoneInputSent    *bool  `json:"phoneInputSent"`
			Transport         string `json:"transport"`
			ServerPeerAddress string `json:"serverPeerAddress"`
		}
		if json.Unmarshal(m.Data, &v) != nil || !v.Probe || v.Nonce != "desktop-self-test" || v.PhoneInputSent == nil || *v.PhoneInputSent {
			done <- errors.New("invalid echo")
		} else {
			if v.Transport != "" {
				host, port, splitErr := net.SplitHostPort(v.ServerPeerAddress)
				if v.Transport != "udp" || splitErr != nil || net.ParseIP(host) == nil || port == "0" {
					done <- errors.New("invalid server path evidence")
					return
				}
				log.Printf("server evidence selectedRemote=%s transport=%s", v.ServerPeerAddress, v.Transport)
			}
			done <- nil
		}
	})
	offer, err := pc.CreateOffer(nil)
	if err != nil {
		return err
	}
	if err = pc.SetLocalDescription(offer); err != nil {
		return err
	}
	pwd := ""
	for _, line := range strings.Split(pc.LocalDescription().SDP, "\n") {
		if strings.HasPrefix(line, "a=ice-pwd:") {
			pwd = strings.TrimSpace(strings.TrimPrefix(line, "a=ice-pwd:"))
			break
		}
	}
	if len(pwd) < 22 {
		return errors.New("no local password")
	}
	if err = pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: syntheticAnswer(c.IP, c.Port, c.Fingerprint, pwd)}); err != nil {
		return err
	}
	select {
	case err = <-done:
		return err
	case <-time.After(20 * time.Second):
		return errors.New("self test timed out")
	}
}

func main() {
	dir := flag.String("state", "build/rtc-direct", "ignored certificate/output directory")
	host := flag.String("host", "192.168.0.107", "LAN IPv4 advertised to browser")
	port := flag.Int("port", 18948, "UDP listen port")
	testOnly := flag.Bool("self-test", false, "run loopback client against reference listener and exit")
	clientConfig := flag.String("client-config", "", "run client against public endpoint JSON and exit")
	flag.Parse()
	if *clientConfig != "" {
		data, err := os.ReadFile(*clientConfig)
		if err != nil {
			log.Fatal("cannot read endpoint")
		}
		var c publicConfig
		if json.Unmarshal(data, &c) != nil {
			log.Fatal("invalid endpoint")
		}
		if err = selfTest(c); err != nil {
			log.Fatal("client test failed: ", err)
		}
		log.Print("client echo passed")
		return
	}
	cert, err := certificate(*dir)
	if err != nil {
		log.Fatal(err)
	}
	fp, err := cert.GetFingerprints()
	if err != nil {
		log.Fatal("fingerprint failed")
	}
	cfg := publicConfig{1, *host, *host, *port, strings.ToUpper(fp[0].Value), strings.ToUpper(fp[0].Value), "webrtc-direct-v2", 512, false}
	data, _ := json.MarshalIndent(cfg, "", "  ")
	if err = os.WriteFile(filepath.Join(*dir, "endpoint.json"), append(data, '\n'), 0644); err != nil {
		log.Fatal(err)
	}
	udp, err := net.ListenPacket("udp4", fmt.Sprintf("0.0.0.0:%d", *port))
	if err != nil {
		log.Fatal(err)
	}
	logger := logging.NewDefaultLoggerFactory()
	logger.DefaultLogLevel = logging.LogLevelDisabled
	s := &server{peers: make(map[string]*peer), cert: cert, logger: logger, ready: make(chan struct{})}
	watched := &watchedConn{PacketConn: udp, inspect: s.inspect}
	s.mux = ice.NewUDPMuxDefault(ice.UDPMuxParams{UDPConn: watched, Logger: logger.NewLogger("ice")})
	close(s.ready)
	defer s.mux.Close()
	log.Printf("transport=webrtc-direct-v2 udp=%d maxPeers=2 idleSeconds=60 maxMessageBytes=512 noHID=true", *port)
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	if *testOnly {
		cfg.IP = "127.0.0.1"
		if err = selfTest(cfg); err != nil {
			log.Fatal("self test failed: ", err)
		}
		log.Print("self test echo passed")
		return
	}
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			s.mu.Lock()
			copyPeers := make(map[string]*peer)
			for key, p := range s.peers {
				copyPeers[key] = p
			}
			s.mu.Unlock()
			for key, p := range copyPeers {
				s.drop(key, p)
			}
			return
		case <-ticker.C:
			s.mu.Lock()
			expired := make(map[string]*peer)
			for key, p := range s.peers {
				if time.Since(time.Unix(0, p.last.Load())) > 60*time.Second {
					expired[key] = p
				}
			}
			s.mu.Unlock()
			for key, p := range expired {
				s.drop(key, p)
			}
		}
	}
}
