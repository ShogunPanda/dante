{
  "name": "@NAME@",
  "version": "0.1.0",
  "description": "",
  "homepage": "",
  "repository": "",
  "bugs": {
    "url": ""
  },
  "author": "",
  "license": "",
  "licenses": [
    {
      "type": "",
      "url": ""
    }
  ],
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "dante development",
    "build": "dante build",
    "postbuild": "concurrently npm:lint npm:lint:css npm:typecheck",
    "serve": "dante server",
    "format": "prettier -w src",
    "lint": "eslint --cache",
    "lint:css": "stylelint --cache src",
    "typecheck": "tsc -p . --emitDeclarationOnly"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@cowtech/eslint-config": "^10.0.0",
    "@cowtech/stylelint-config": "^1.0.0",
    "@swc/core": "^1.7.36",
    "@types/node": "^22.7.7",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "commander": "^12.1.0",
    "concurrently": "^9.0.1",
    "dante": "@VERSION@",
    "eslint": "^9.13.0",
    "pino": "^9.5.0",
    "prettier": "^3.3.3"
  },
  "engines": {
    "node": ">= 20.18.0"
  }
}
