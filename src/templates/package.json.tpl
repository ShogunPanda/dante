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
    "lint": "eslint --cache --ext .js,.jsx,.ts,.tsx src",
    "lint:css": "stylelint --cache src",
    "typecheck": "tsc -p . --emitDeclarationOnly"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@cowtech/eslint-config": "^9.0.3",
    "@cowtech/stylelint-config": "^0.1.1",
    "@swc/core": "^1.4.2",
    "@types/node": "^20.11.20",
    "@types/react": "^18.2.60",
    "@types/react-dom": "^18.2.19",
    "commander": "^12.0.0",
    "concurrently": "^8.2.2",
    "dante": "^@VERSION@",
    "pino": "^8.19.0",
    "prettier": "^3.2.5"
  },
  "engines": {
    "node": ">= 18.18.0"
  }
}