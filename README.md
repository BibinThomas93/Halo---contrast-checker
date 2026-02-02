# Halo - Contrast checker

To check all accessibility criteria of the Figma design in a single click based on WCAG standard.

---

Below are the steps to get your plugin running. You can also find instructions at:

  https://www.figma.com/plugin-docs/plugin-quickstart-guide/

This plugin template uses TypeScript and NPM, two standard tools in creating JavaScript applications.

First, download Node.js which comes with NPM. You can find the download link here:

  https://nodejs.org/en/download/

Next, in the directory of the plugin, install dependencies and get the latest type definitions:

  npm install
  npm install --save-dev @figma/plugin-typings

Compile TypeScript to JavaScript:

  npm run build

We recommend writing TypeScript code using Visual Studio Code:

1. Download Visual Studio Code if you haven't already: https://code.visualstudio.com/
2. Open this directory in Visual Studio Code.
3. Compile TypeScript: Run "Terminal > Run Build Task..." then select "npm: watch".

That's it! Visual Studio Code will regenerate code.js every time you save.
