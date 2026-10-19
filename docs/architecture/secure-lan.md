# Local WebRTC transport

[Phone setup](../acceptance/README.md) · [中文连接](lan-connection.md) · [Device client](device-client.md)

Harness opens WebRTC Direct from the same browser page to the bridge on the local network. The device's setup return link or USB link supplies its actual address and `rtc` metadata. No external signaling server, TURN relay or persistent helper tab is required. HTTP remains for local provisioning, settings and clipboard jobs; normal control uses the data channel.

The project supplies shared DTLS communication configuration in the website and firmware. It is not an individual board identity or credential. Authorization separately checks board/boot, browser token, selected usable target, writer lease and operation identity. No per-board CA installation is required.

The bridge uses one reliable ordered negotiated data channel, ID 0, on UDP 18948. The bounded SCTP implementation checks checksum, cookie, tag, ordering, duplicates and acknowledgement/retransmission. Application frames are at most 512 UTF-8 bytes, with 256-byte chunks. One RPC is active at a time. Request numbering prevents same-connection replay; UUIDs correlate replies. Cancellation of dispatched work closes the connection and is never an automatic mutation retry.

Local setup changes a board's Wi-Fi or hostname; a return link imports fresh connection information into Harness. Importing details must not be presented as a successful live connection. Current firmware supports direct target binding, while the optional digit test offers observed-input evidence.

The current implementation has one active RTC peer; multiple saved clients are not simultaneous control channels. Firmware protocol tests and compilation do not establish radio coexistence, background scheduling or phone input reliability. The latest multi-client enrollment/import repair remains prepared but unflashed and physically unverified.
