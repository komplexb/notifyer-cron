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

# Demo
![Notifyer Documentation](https://user-images.githubusercontent.com/3874813/99654228-20ecd480-2aae-11eb-9c53-1bb0c50dcdfa.png)

Try [Notifyer for MacOS][3].

[1]: https://www.npmjs.com/package/@azure/msal-node
[2]: https://docs.pushbullet.com/#pushbullet-api
[3]: https://github.com/komplexb/notifyer-electron
