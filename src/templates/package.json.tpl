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
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@cowtech/eslint-config": "^11.0.0",
    "@cowtech/stylelint-config": "^2.0.1",
    "@cowtech/typescript-config": "^0.2.2",
    "@swc/core": "^1.7.36",
    "@types/node": "^24.10.1",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "commander": "^14.0.2",
    "dante": "@VERSION@",
    "eslint": "^9.39.1",
    "pino": "^10.1.0",
    "prettier": "^3.6.2"
  },
  "engines": {
    "node": ">= 22.21.0"
  }
}
