import { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
import { Type } from '@fastify/type-provider-typebox';

import TranslationService from '@/services/TranslationService';

const flexReservationAccepted: FastifyPluginAsync = async (server) => {
  server.post(
    '/reservation-accepted',
    {
      logLevel: 'info',
      schema: {
        body: Type.Object({
          EventType: Type.String(),
          AccountSid: Type.String(),
          WorkspaceSid: Type.String(),
          ResourceSid: Type.String(),
          TaskAttributes: Type.String(),
        }),
      },
    },
    async (req, res) => {
      const logger = req.diScope.resolve<FastifyBaseLogger>('logger');
      const map =
        req.diScope.resolve<Map<string, TranslationService>>(
          'translationInterceptors',
        );
      console.log("task attributes", JSON.parse(req.body?.TaskAttributes));
      const { from } = JSON.parse(req.body.TaskAttributes);

      const translationService = map.get(from);
      if (!translationService) {
        logger.error('translationService not found');
        res.status(404).send('Not Found');
        return;
      }

      translationService.start();
      res.status(200).send('OK');
    },
  );
};

export default flexReservationAccepted;
