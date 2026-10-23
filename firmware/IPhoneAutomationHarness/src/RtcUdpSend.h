#pragma once
#include <cerrno>
#include <cstddef>

namespace iah { namespace rtc {
// Wi-Fi's nonblocking UDP send can temporarily exhaust packet buffers. Treat
// this as datagram loss: DTLS handshake timers and SCTP retransmission recover
// it. Reporting WANT_WRITE as a fatal application write closes a healthy peer.
inline bool udpBackpressure(int error){
 return error==EAGAIN||error==EWOULDBLOCK||error==ENOMEM||error==ENOBUFS;
}
inline int udpSendResult(int sent,size_t expected,int error){
 return sent<0&&udpBackpressure(error)?static_cast<int>(expected):sent;
}
}}
