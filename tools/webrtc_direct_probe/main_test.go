package main

import (
	"github.com/pion/stun/v3"
	"strings"
	"testing"
)

func TestV2UsernameAndIntegrity(t *testing.T) {
	pwd := "abcdABCD0123456789+/abcd"
	local := prefix + pwd
	remote := "abcd1234"
	packet, err := stun.Build(stun.TransactionID, stun.BindingRequest, stun.NewUsername(local+":"+remote), stun.NewShortTermIntegrity(local), stun.Fingerprint)
	if err != nil {
		t.Fatal(err)
	}
	a, b, c, ok := credentials(packet.Raw)
	if !ok || a != local || b != remote || c != pwd {
		t.Fatal("valid v2 credentials rejected")
	}
	for _, username := range []string{"libp2p+webrtc+v1/" + pwd + ":" + remote, local + ":bad\r\nx", prefix + "short:" + remote, local + ":" + remote + ":extra", prefix + strings.Repeat("x", 240) + ":" + remote} {
		packet, err = stun.Build(stun.TransactionID, stun.BindingRequest, stun.NewUsername(username), stun.NewShortTermIntegrity(local))
		if err != nil {
			t.Fatal(err)
		}
		if _, _, _, ok = credentials(packet.Raw); ok {
			t.Fatalf("invalid credentials accepted")
		}
	}
	packet, err = stun.Build(stun.TransactionID, stun.BindingRequest, stun.NewUsername(local+":"+remote), stun.NewShortTermIntegrity("different"))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, _, ok = credentials(packet.Raw); ok {
		t.Fatal("wrong integrity accepted")
	}
}
