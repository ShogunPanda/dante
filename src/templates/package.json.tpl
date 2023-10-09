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
    "serve": "dante server",
    "format": "prettier -w src",
    "lint": "eslint --ext .ts,.tsx src"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@cowtech/eslint-config": "^8.8.0",
    "@swc/core": "^1.3.24",
    "@types/node": "^18.11.11",
    "@types/react": "^18.0.26",
    "@types/react-dom": "^18.0.9",
    "@unocss/core": "^0.47.5",
    "@unocss/preset-mini": "^0.47.5",
    "@unocss/preset-wind": "^0.47.5",
    "@unocss/transformer-directives": "^0.47.5",
    "commander": "^9.4.1",
    "dante": "^@VERSION@",
    "pino": "^8.8.0",
    "prettier": "^2.5.1"
  }
}