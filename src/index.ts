import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { URLPattern } from "urlpattern-polyfill";
import { Option, program } from "commander";
import untildify from 'untildify';
import inquirer from "inquirer";
import pc from "picocolors";
import * as INI from "ini";

// Feeds can be either organization-scoped or project-scoped. Those will have different URL patterns.
const azureDevOpsOrganizationFeedPattern = new URLPattern("https://pkgs.dev.azure.com/:organization/_packaging/:feed/npm/registry/");
const azureDevOpsProjectFeedPattern = new URLPattern("https://pkgs.dev.azure.com/:organization/:project/_packaging/:feed/npm/registry/");

async function main() {
  program
    .option("--pat <pat>", 'Azure DevOps Private Access Token with "Packaging (Read & Write)" permissions')
    .option("--url <urls...>", "Azure DevOps feed URL. Accepts multiple URLs.")
    .addOption(
      new Option("--npmrc <path>", "Path to the .npmrc file that specifies the Azure DevOps feed").default("./.npmrc"),
    )
    .addOption(
      new Option("--target <path>", "Path to the .npmrc file that will receive the authentication token").default("~/.npmrc"),
    )
    .parse();

  const options = program.opts();
  let pat = options.pat as string | undefined;
  let url = (options.url ?? []) as string[];
  const npmrc = untildify(options.npmrc);
  const target = untildify(options.target);

  // Validate the PAT input
  if (pat) {
    if (!isPat(pat)) {
      console.error(pc.red("The input does not look like a PAT. Make sure you pasted it correctly."));
      process.exit(1);
    }
  }

  // Validate the URL input
  url.forEach((value) => {
    const match = azureDevOpsOrganizationFeedPattern.test(value) || azureDevOpsProjectFeedPattern.test(value);
    if (!match) {
      console.log(pc.red(`"${value}" is not a valid Azure DevOps NPM feed URL. Expected "https://pkgs.dev.azure.com/:organization(/:project)/_packaging/:feed/npm/registry/"`));
      process.exit(1);
    }
  });

  // If we don't have any URL, we try to get the URLs from the .npmrc file
  if (url.length === 0) {
    if (!existsSync(npmrc)) {
      console.error(pc.red(`Failed to find NPM configuration file. "${npmrc}" does not exist.`));
      process.exit(1);
    }

    const text = readFileSync(npmrc, "utf-8");
    const config = INI.parse(text);

    for (const [key, value] of Object.entries(config)) {
      const isRegistryEntry = (key === "registry") ||
        (key.startsWith("@") && key.endsWith(":registry"));
      if (!isRegistryEntry) {
        continue;
      }

      const match = azureDevOpsOrganizationFeedPattern.test(value) || azureDevOpsProjectFeedPattern.test(value);
      if (!match) {
        // Not a valid Azure DevOps feed URL
        continue;
      }

      url.push(value);
    }
  }

  // If we still don't have the URL, we can't continue. Display an error and quit.
  if (url.length === 0) {
    console.error(pc.red(`Could not find any Azure DevOps feeds in "${npmrc}". Please add the feed to the file or specify the feed URL with the "--url" option.`));
    process.exit(1);
  }

  // If we don't have a PAT, we prompt the user for one.
  if (!pat) {
    // To generate a valid URL to the Access Token page, we extract the organization name from one of the URLs.
    const firstUrl = url[0];
    const result = azureDevOpsOrganizationFeedPattern.exec(firstUrl) ||
      azureDevOpsProjectFeedPattern.exec(firstUrl);

    if (!result) {
      console.error(pc.red(`Failed to parse Azure DevOps feed URL: "${firstUrl}"`));
      process.exit(1);
    }

    const { organization } = result.pathname.groups;
    const tokensUrl = `https://dev.azure.com/${organization}/_usersSettings/tokens`;

    console.log(`Please generate a PAT at: ${pc.cyan(tokensUrl)}`);
    console.log(`Permissions required: ${pc.green("Packaging (Read & Write)")}`);

    const answer = await inquirer.prompt({
      message: "PAT",
      type: "password",
      name: "untrimmedPat",
      validate: (input) => {
        if (typeof input !== "string") {
          return "Invalid input. Input must be a string.";
        }

        input = input.trim();
        if (!input) return "PAT cannot be empty.";
        if (!isPat(input)) return "The input does not look like a PAT. Make sure you pasted it correctly.";
        return true;
      },
    });

    pat = answer.untrimmedPat.trim() as string;
  }

  const password = btoa(pat);

  // Create a target file if it does not exist
  if (!existsSync(target)) {
    const targetDir = dirname(target);
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
    writeFileSync(target, "");
  }

  // Add the values to the file if they don't exist, replace them if they
  // exist. We go through each line manually instead of using the INI parser
  // because we want to preserve the comments and structure of the file.
  const targetText = readFileSync(target, "utf-8");
  const lines = targetText.split("\n");
  for (const feedUrlAsString of url) {
    const feedUrl = new URL(feedUrlAsString);
    const globalNpmrcKeyPrefix = `//${feedUrl.hostname}${feedUrl.pathname}`;

    let replacedUsername = false;
    const usernamePrefix = `${globalNpmrcKeyPrefix}:username`;

    let replacedPassword = false;
    const passwordPrefix = `${globalNpmrcKeyPrefix}:_password`;

    let replacedEmail = false;
    const emailPrefix = `${globalNpmrcKeyPrefix}:email`;

    for (const index in lines) {
      const line = lines[index].trim();

      if (line.startsWith(usernamePrefix)) {
        lines[index] = `${usernamePrefix}=VssSessionToken`;
        replacedUsername = true;
        continue;
      }

      if (line.startsWith(passwordPrefix)) {
        lines[index] = `${passwordPrefix}=${password}`;
        replacedPassword = true;
        continue;
      }

      if (line.startsWith(emailPrefix)) {
        lines[index] = `${emailPrefix}=not-used@example.com`;
        replacedEmail = true;
        continue;
      }
    }

    if (!replacedUsername) {
      lines.push(`${usernamePrefix}=VssSessionToken`);
    }


    if (!replacedPassword) {
      lines.push(`${passwordPrefix}=${password}`);
    }

    if (!replacedEmail) {
      lines.push(`${emailPrefix}=not-used@example.com`);
    }
  }

  const text = lines.join("\n");
  writeFileSync(target, text);

  console.log(pc.bold(pc.green("Authentication successful.")));
}

main();

function isPat(input: string): boolean {
  return /^[a-z\d]{52,}$/i.test(input);
}