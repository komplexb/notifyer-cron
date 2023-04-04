
# What is this?

A cron job that calls an AWS Lambda function.

# What does it do?

It sends a random inspirational quote twice a day.

# Aren't there a million apps for that?

Maybe, but this one retrieves the quotes from my personal repository of notes stored in Microsoft OneNote.

# How does it work?

![Notifyer (1)](https://user-images.githubusercontent.com/3874813/99929945-5988f880-2da3-11eb-9c5e-d892b7ff4cee.png)

# What's your stack?

The service depends on the [Pushbullet API][2] and [MS Graph API][1] node library which streamlines the development process. It was scaffolded with the Serverless NodeJS template and uses the following AWS services:

- Lambda
- EventBridge
- DynamoDB
- Parameter Store

# ToDo

[Project Board on Github][4]

# Demo

![Notifyer Documentation](https://user-images.githubusercontent.com/3874813/99654228-20ecd480-2aae-11eb-9c53-1bb0c50dcdfa.png)


# Setup Git

- [Configure auth so you can push](https://docs.github.com/en/get-started/getting-started-with-git/caching-your-github-credentials-in-git#github-cli)
- [Configure private email](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/setting-your-commit-email-address)


# Getting Started

- `npm i serverless@2 -g`
- `npm i`
- Create a AWS credential profile called `serverless`
  - Open your credentials file `code ~/.aws/credentials`
  - If the file doesn't exist or the profile is empty, follow the instructions on how to [Setup AWS Profile][5]
- create `tmp/cache.json` folder in the root folder

# Try the Mac App

Download [Notifyer for MacOS][3].

[1]: https://www.npmjs.com/package/@azure/msal-node
[2]: https://docs.pushbullet.com/#pushbullet-api
[3]: https://github.com/komplexb/notifyer-electron
[4]: https://github.com/komplexb/notifyer-cron/projects/1#column-11918290
[5]: https://www.serverless.com/framework/docs/providers/aws/guide/credentials/#using-aws-access-keys
