const logSpy = jest.spyOn(global.console, 'log')
const warnSpy = jest.spyOn(global.console, 'warn')
const infoSpy = jest.spyOn(global.console, 'info')
const errorSpy = jest.spyOn(global.console, 'error')

const app = require('./app')

describe('handler ran successfully', () => {
  it('integration', async () => {
    const result = await app.handler({
      section: 'Verses'
    })
    expect(result.status).toEqual(200)

    const info = infoSpy.mock.calls[0]
    expect(info).toMatchSnapshot()
  }, 20000)
})

/* describe('Unit test for app handler', function () {
  it('verifies successful response', async () => {
      const event: APIGatewayProxyEvent = {
          queryStringParameters: {
              a: "1"
          }
      } as any
      const result = await lambdaHandler(event)

      expect(result.statusCode).toEqual(200);
      expect(result.body).toEqual(`Queries: ${JSON.stringify(event.queryStringParameters)}`);
  });
});
 */
