# Local WebRTC transport

[Phone setup](../guide/README.md#bridge) · [中文连接](lan-connection.md) · [Device client](device-client.md)

Harness connects directly to the bridge on the local network from the current browser page. The device manager's return link or the USB setup link provides its IP address and WebRTC metadata. Local HTTP handles Wi-Fi setup, settings and clipboard jobs.

Website and firmware share the DTLS communication certificate configuration. Application requests identify the board, boot, browser client, selected phone, writer lease and operation.

The bridge offers two independent WebRTC slots on UDP 18948 and 18949. Each uses one reliable ordered negotiated data channel, ID 0. SCTP checks checksums, cookies, tags, ordering and acknowledgements, with duplicate handling and retransmission. Application frames are at most 512 UTF-8 bytes, with 256-byte payload chunks. Each slot has its own peer, DTLS session and RPC state; one RPC is active per connection.

Monotonic request numbering identifies messages within a connection; UUIDs correlate requests and replies. Cancelling dispatched work closes the connection. An uncertain mutation is reconciled before a new command is sent.

After changing Wi-Fi or hostname in the local manager, return to Harness to save updated connection information. Connect the bridge and select a Bluetooth phone to bind the target. The optional digit test checks keyboard input. When two phones share a bridge, test each page to confirm its selected phone.
