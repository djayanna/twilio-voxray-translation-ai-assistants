import { FastifyBaseLogger } from 'fastify';
import WebSocket from 'ws';
import OpenAI from 'openai';
import z from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { Prompt } from 'twilio/lib/twiml/VoiceResponse';

import StreamSocket, { PromptVoxrayMessage } from '@/services/StreamSocket';
import { Config } from '@/config';
import { TRANSLATION_PROMPT_AGENT, TRANSLATION_PROMPT_CALLER } from '@/prompts';

type TranslatorOptions = {
  logger: FastifyBaseLogger;
  config: Config;
  callerLanguage: string;
};

export default class TranslationService {
  private static instance: TranslationService;

  private readonly logger: FastifyBaseLogger;

  private config: Config;

  private readonly callerLanguage?: string;

  private openai: OpenAI;

  #callerSocket?: StreamSocket;

  #agentSocket?: StreamSocket;

  public constructor(options: TranslatorOptions) {
    this.logger = options.logger;
    this.config = options.config;
    this.callerLanguage = options.callerLanguage;
    this.openai = new OpenAI();
  }

  /**
   * Closes the audio interceptor
   */
  public close() {
    if (this.#callerSocket) {
      this.#callerSocket.close();
      this.#callerSocket = null;
    }
    if (this.#agentSocket) {
      this.#agentSocket.close();
      this.#agentSocket = null;
    }
  }

  /**
   * Starts the audio interception
   */
  public start() {
    if (!this.#agentSocket || !this.#callerSocket) {
      this.logger.error('Both sockets are not set. Cannot start interception');
      return;
    }

    // add event listeners for prompts
    this.#callerSocket.onPrompt(
      this.translateCallerTextAndSendReponse.bind(this),
    );
    this.#agentSocket.onPrompt(
      this.translateAgentTextAndSendReponse.bind(this),
    );

    // add event listeners for interruption
    this.logger.info('Both sockets are set. Starting interception');
  }

  private translateCallerTextAndSendReponse(message: PromptVoxrayMessage) {
    this.logger.info('caller prompt %s', JSON.stringify(message));
    this.sendToOpenAIForTranslation(
      this.#agentSocket,
      message.voicePrompt,
      'spanish',
      'en-US',
      true,
    );
  }

  private translateAgentTextAndSendReponse(message: PromptVoxrayMessage) {
    this.logger.info('agent prompt %s ', JSON.stringify(message));
    this.sendToOpenAIForTranslation(
      this.#callerSocket,
      message.voicePrompt,
      'Spanish',
      'es-US',
      false,
    );
  }

  private async sendToOpenAIForTranslation(
    ss: StreamSocket,
    message: string,
    sourceLanguage: string,
    targetLanguage: string,
    caller = false,
  ) {
    const Translation = z.object({
      sourceLanguage: z.string(),
      targetLanguage: z.string(),
      translationText: z.string(),
    });

    const promptTemplate = caller
      ? TRANSLATION_PROMPT_CALLER
      : TRANSLATION_PROMPT_AGENT;

    const prompt = [
      {
        role: 'system',
        content: promptTemplate.replace(/\[CALLER_LANGUAGE\]/g, sourceLanguage),
      },
      {
        role: 'user',
        content: message,
      },
    ];

    let llmResponse = '';
    let finishReason = '';

    this.logger.info('prompt %s', JSON.stringify(prompt));

    const stream = await this.openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',
      messages: prompt,
      response_format: zodResponseFormat(Translation, 'translation'),
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      finishReason = chunk.choices[0].finish_reason;

      if (content) {
        llmResponse += content;
        if (content.trim().slice(-1) === '•' || finishReason === 'stop') {
          this.logger.info('finish reason', finishReason);
        }
      }
    }

    this.logger.info('Sending translated message to %s', llmResponse);

    const mediaMessage = {
      type: 'text',
      token: JSON.parse(llmResponse).translationText,
      targetLanguage,
      last: true,
    };

    this.logger.info(
      'Sending translated message to %s',
      JSON.stringify(mediaMessage),
    );

    ss.send(JSON.stringify(mediaMessage));

    llmResponse = '';
  }

  get callerSocket(): StreamSocket {
    if (!this.#callerSocket) {
      throw new Error('Caller socket not set');
    }
    return this.#callerSocket;
  }

  set callerSocket(value: StreamSocket) {
    this.#callerSocket = value;
  }

  get agentSocket(): StreamSocket {
    if (!this.#agentSocket) {
      throw new Error('Agent socket not set');
    }
    return this.#agentSocket;
  }

  set agentSocket(value: StreamSocket) {
    this.#agentSocket = value;
  }
}
