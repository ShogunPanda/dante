# dante

[![Version](https://img.shields.io/npm/v/dante.svg)](https://npm.im/dante)
[![Dependencies](https://img.shields.io/librariesio/release/npm/dante)](https://libraries.io/npm/dante)

Opinionated static site generator.

http://sw.cowtech.it/dante

## Installation

```
npx --package=dante -- create-dante-site my-site
cd my-site
npm install
dante dev
```

## Usage

### Creating pages and files

Simply create all file needed in the `build` function in `src/build/index.ts`. You can use any framework you want, the predefined one is React.

We strongly recommend to use the `createFile` function exported from `dante` to create file as it will take care of replacing `$hash` in the file name with the actual file hash.

Also, in order to correctly apply production optimizations, call and await the provided `after` callback after done building your site.

Your `src/build/index.ts` must export the following members:

- `build`: A function that creates all website files.
- `createStylesheet`: A function that converts a list of CSS classes in CSS code. Inside use of `createStylesheet` function exported from `dante` is encouraged.
- `safelist`: A list of CSS classes that you always to be present in any page and that will not be compressed.

### Exporting

Once you have done editing, you should execute `dante build`. The website will be exported in the `dist` folder.

### Adding commands to dante

You can create a file `src/build/cli.ts` that should export a `setupCLI` function.
The function will received a [commander](https://npm.im/commander) program and a [pino](https://getpino.io) logger in order to modify the dante CLI.

## ESM Only

This package only supports to be directly imported in a ESM context.

For informations on how to use it in a CommonJS context, please check [this page](https://gist.github.com/ShogunPanda/fe98fd23d77cdfb918010dbc42f4504d).

## Contributing to dante

- Check out the latest master to make sure the feature hasn't been implemented or the bug hasn't been fixed yet.
- Check out the issue tracker to make sure someone already hasn't requested it and/or contributed it.
- Fork the project.
- Start a feature/bugfix branch.
- Commit and push until you are happy with your contribution.
- Make sure to add tests for it. This is important so I don't break it in a future version unintentionally.

## Copyright

Copyright (C) 2022 and above Shogun (shogun@cowtech.it).

Licensed under the ISC license, which can be found at https://choosealicense.com/licenses/isc.
