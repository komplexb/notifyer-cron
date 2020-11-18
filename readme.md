# What is this?
A cron job that calls an AWS Lambda function.

# What does it do?
It sends a random inspirational quote twice a day.

# Aren't there a million apps for that?
Maybe, but this one retrieves the quotes from my personal repository of notes stored in Microsoft OneNote.

# How does it work?
⌚ cron event triggers a ƛ function which selects a random 🎲 note to be delivered by push notification📬.

# What's your stack?
The service depends on the [Pushbullet API][2] and [MS Graph API][1] node library which streamlines the development process. It was scaffolded with the Serverless NodeJS template and uses the following AWS services:
- Lambda
- EventBridge
- DynamoDB
- Parameter Store


Try [Notifyer for MacOS][3].

[1]: https://www.npmjs.com/package/@azure/msal-node
[2]: https://docs.pushbullet.com/#pushbullet-api
[3]: https://github.com/komplexb/notifyer-electron
