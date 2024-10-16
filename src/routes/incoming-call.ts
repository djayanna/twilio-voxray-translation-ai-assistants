import { Type } from '@fastify/type-provider-typebox';
import { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';

const incomingCall: FastifyPluginAsync = async (server) => {
  server.post(
    '/incoming-call',
    {
      logLevel: 'info',
      schema: {
        body: Type.Object({
          From: Type.String(),
          To: Type.String(),
          CallSid: Type.String(),
        }),
      },
    },
    async (req, reply) => {
      const logger = req.diScope.resolve<FastifyBaseLogger>('logger');
      const from = (req.body as any).From;
      try {
        logger.info('Sending TwiML response...');
        reply.type('text/xml');
        reply.send(
          `<Response>
            <Connect>
              <ConversationRelay url="wss://${server.config.NGROK_DOMAIN}/intercept?direction=inbound&amp;from=${from}" welcomeGreeting="Hello">
                <Lang code="es-US" voice="es-US-Wavenet-B"/>
              </ConversationRelay>
            </Connect>
          </Response>`,
        );
      } catch (error) {
        logger.error('Error creating Flex task:', { error });
        reply.status(500).send('Internal Server Error');
      }
    },
  );
};

export default incomingCall;
