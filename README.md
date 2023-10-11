# @tjosepo/azure-devops-npm-auth

Authentication helper for Azure Artifacts.

## Getting started

Install the package:

```
npm install -D @tjosepo/azure-devops-npm-auth
```

Then, run:

```
npx azure-devops-npm-auth
```



## Usage with CLI

```
$ npx azure-devops-npm-auth --help

Usage: azure-devops-npm-auth [options]

Options:
  --pat <pat>      Azure DevOps Private Access Token with "Packaging (Read & Write)" permissions
  --url <urls...>  Azure DevOps feed URL. Accepts multiple URLs.
  --npmrc <path>   Path to the .npmrc file that specifies the Azure DevOps feed (default: "./.npmrc")
  --target <path>  Path to the .npmrc file that will receive the authentication token (default: "~/.npmrc")
  -h, --help       display help for command
```