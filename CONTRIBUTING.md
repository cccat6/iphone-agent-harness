# Contributing

Bug reports, feature ideas and pull requests are welcome.

- Open an [issue](https://github.com/cccat6/iphone-agent-harness/issues) with the expected behavior, actual behavior and the steps needed to reproduce it. For device problems, include the ESP32 model, firmware version, iOS version and browser version. Remove API keys, Wi-Fi credentials and private screen content from logs.
- Submit a [pull request](https://github.com/cccat6/iphone-agent-harness/pulls) for code, documentation, translations or improvements to the built-in runtime and skills. Explain the user-visible change and how you verified it.
- Share custom skills through the [website skill community](https://igent.cc/skills). Create or import your own skill, review it and choose Publish. You do not need a code pull request for a custom skill.

## Local development

```sh
npm ci
npm test
npm run build
npm run preview
```

Firmware build and test instructions are in the [Arduino guide](firmware/IPhoneAutomationHarness/README.md). Ordinary use only needs the [browser installer](https://igent.cc/flash); a local Arduino environment is not required.

GitHub Actions run only when explicitly requested through the manual release workflow. Normal pushes and pull requests do not start compilation or deployment.
