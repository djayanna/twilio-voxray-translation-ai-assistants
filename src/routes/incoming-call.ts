import { Type } from '@fastify/type-provider-typebox';
import { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';

import { voices } from '@/voices';

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
      const { lang } = req.query as any;
      const voice = voices[lang] || 'en-US-Journey-O';

      try {
        logger.info('Sending TwiML response...');
        reply.type('text/xml');
        reply.send(
          `<Response>
            <Connect>
              <ConversationRelay url="wss://${server.config.NGROK_DOMAIN}/intercept?direction=inbound&amp;from=${from}&amp;lang=${lang}" welcomeGreeting="Hello">
                <Lang code="${lang}" voice="${voice}"/>
              </ConversationRelay>
            </Connect>
          </Response>`,
        );
      } catch (error) {
        logger.error('Error connecting to ConversationRelay:', { error });
        reply.status(500).send('Internal Server Error');
      }
    },
  );
};

export default incomingCall;
