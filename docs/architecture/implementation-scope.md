# Implementation scope

The product is a static Web Harness plus ESP32 firmware. The optional public-skill backend is part of the Web product, not a conversation host. Tests, schemas and documentation support these parts.

The runtime uses fixed capabilities and declarative bounded plans. Skills are content, not a dynamic executable plugin system. The browser owns reasoning, capture and private history; the board owns local input timing and target leases. No native iOS or Android application is supplied.

User intent separates questions, reviewable planning and explicit execution in one conversation. Source includes internal mode contracts; they do not require users to switch between separate applications. A plan request alone does not execute it.

Do not present imported metadata, a successful build, a protocol receipt or an old candidate result as complete physical acceptance. Current limitations are summarized in [validation](validation.md) and the [phone guide](../acceptance/README.md).
