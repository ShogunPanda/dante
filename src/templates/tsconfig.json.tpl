{
  "extends": "@cowtech/typescript-config",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "./src"
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
