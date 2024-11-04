import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { FastifyBaseLogger } from 'fastify';
import Twilio from 'twilio';

import TranslationService from '@/services/TranslationService';
import StreamSocket, { SetupVoxrayMessage } from '@/services/StreamSocket';
import { voices } from '@/voices';

const interceptWS: FastifyPluginAsyncTypebox = async (server) => {
  server.get(
    '/intercept',
    {
      websocket: true,
    },
    async function (
      socket,
      req: {
        query: { direction: string; from: string; lang: string };
      },
    ) {
      const twilio = Twilio(
        server.config.TWILIO_ACCOUNT_SID,
        server.config.TWILIO_AUTH_TOKEN,
      );

      const logger = req.diScope.resolve<FastifyBaseLogger>('logger');

      const { direction, from, lang } = req.query;

      const ss = new StreamSocket({
        logger,
        socket,
      });
      const map = req.diScope.resolve<Map<string, TranslationService>>(
        'translationInterceptors',
      );

      ss.onSetup(async (message: SetupVoxrayMessage) => {
        logger.info('message %s', JSON.stringify(message));

        if (direction === 'inbound') {
          logger.info(
            'Added interceptor for call from %s callSid %s',
            message.from,
            message.callSid,
          );

          const translationService = new TranslationService({
            logger,
            config: server.config,
            callerLanguage: lang,
          });

          map.set(message.from, translationService);

          logger.info('map size');
          logger.info('map size %s', map.size);

          translationService.callerSocket = ss;

          const mediaMessage = {
            type: 'transcriptionLanguage',
            lang: `'${lang}'`,
          };

          logger.info('switching language %s', JSON.stringify(mediaMessage));

          ss.send(JSON.stringify(mediaMessage));

          const voice = voices[lang] || 'en-US-Journey-O';

          logger.info('Connecting to Agent');
          await twilio.calls.create({
            from: server.config.TWILIO_CALLER_NUMBER,
            to: server.config.TWILIO_FLEX_NUMBER,
            callerId: message.from,
            twiml: `
              <Response>
                <Connect action="https://innocent-wahoo-extremely.ngrok-free.app/redirect">
                  <ConversationRelay url="wss://innocent-wahoo-extremely.ngrok-free.app/intercept?direction=outbound&amp;from=${message.from}" welcomeGreeting="Hello">
                    <Lang code="en-US" voice="${voice}"/>
                  </ConversationRelay>
                </Connect>
              </Response>
            `,
          });
        } else if (direction === 'outbound') {
          logger.info(
            'Added interceptor for callsid %s from %s',
            message.callSid,
            message.from,
          );

          const translationService = map.get(`+${from.trim()}`);

          if (!translationService) {
            logger.error(
              'No translation service found for %s',
              `+${from.trim()}`,
            );
            return;
          }

          logger.info('Setting Agent Socket');
          translationService.agentSocket = ss;
        }
      });

      ss.onStop((message) => {
        if (!message?.from) {
          logger.info('No from in message - unknown what interceptor to close');
          return;
        }

        const interceptor = map.get(message.from);
        if (!interceptor) {
          logger.error('No interceptor found for %s', message.from);
          return;
        }

        logger.info('Closing interceptor');
        interceptor.close();
        map.delete(message.from);
      });
    },
  );
};

export default interceptWS;
