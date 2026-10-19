# Contributing

Bug reports, feature ideas and pull requests are welcome.

- Open an [issue](https://github.com/cccat6/iphone-agent-harness/issues) with the expected behavior, actual behavior and the steps needed to reproduce it. For device problems, include the ESP32 model, firmware version, iOS version and browser version. Remove API keys, Wi-Fi credentials and private screen content from logs.
- Submit a [pull request](https://github.com/cccat6/iphone-agent-harness/pulls) for code, documentation, translations or improvements to the built-in runtime and skills. Explain the user-visible change and how you verified it.
- Share custom skills through the [website skill community](https://igent.cc/skills). Create or import your own skill and choose Publish.

## Local development

```sh
npm ci
npm test
npm run build
npm run preview
```

Firmware build and test instructions are in the [Arduino guide](firmware/IPhoneAutomationHarness/README.md). To install firmware on a board, use the [browser installer](https://igent.cc/flash).

Maintainers start compilation and deployment with the [manual release workflow](docs/architecture/manual-release.md).
