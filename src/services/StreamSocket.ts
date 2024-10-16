import { FastifyBaseLogger } from 'fastify';
import { WebSocket } from '@fastify/websocket';

type BaseAudioMessage = {
  sequenceNumber: number;
};

export type ConnectedBaseAudioMessage = BaseAudioMessage & {
  event: 'connected';
  protocol: string;
};

// All types here https://www.twilio.com/docs/voice/media-streams/websocket-messages#send-websocket-messages-to-twilio
export type StartBaseAudioMessage = BaseAudioMessage & {
  event: 'start';
  start: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    track: 'inbound' | 'outbound';
    customParameters: Record<string, unknown>;
  };
};

export type MediaBaseAudioMessage = BaseAudioMessage & {
  event: 'media';
  media: {
    chunk: number;
    timestamp: string;
    payload: string;
    streamSid: string;
    track: 'inbound' | 'outbound';
  };
};

export type StopBaseAudioMessage = BaseAudioMessage & {
  event: 'stop';
  stop: {
    accountSid: string;
    callSid: string;
  };
  from?: string;
};

export type MarkBaseAudioMessage = BaseAudioMessage & {
  event: 'mark';
  stop: {
    accountSid: string;
    callSid: string;
  };
};

export type SetupVoxrayMessage = {
  type: 'setup';
  sessionId: string;
  callSid: string;
  parentCallSid: string;
  from: string;
  to: string;
  forwardedFrom: string;
  callerName: string;
  direction: string;
  callType: string;
  callStatus: string;
  accountSid: string;
  applicationSid: string;
};

export type PromptVoxrayMessage = {
  type: 'prompt';
  voicePrompt: string;
};

export type InterruptVoxrayMessage = {
  type: 'interrupt';
  utteranceUntilInterrupt: string;
  durationUntilInterruptMs: string;
};

export type TextVoxrayMessage = {
  type: 'text';
  token: string;
  last: string;
};

export type EndVoxrayMessage = {
  type: 'end';
  handoffData: string;
};

type AudioMessage =
  | StartBaseAudioMessage
  | MediaBaseAudioMessage
  | StopBaseAudioMessage
  | ConnectedBaseAudioMessage
  | MarkBaseAudioMessage
  | PromptVoxrayMessage
  | EndVoxrayMessage
  | TextVoxrayMessage
  | InterruptVoxrayMessage;

type VoxRayMessage =
  | SetupVoxrayMessage
  | PromptVoxrayMessage
  | InterruptVoxrayMessage;

type OnCallback<T> = (message: T) => void;

type StreamSocketOptions = {
  logger: FastifyBaseLogger;
  socket: WebSocket;
};
export default class StreamSocket {
  private readonly logger: FastifyBaseLogger;

  public readonly socket: WebSocket;

  public streamSid: string;

  public from?: string;

  private onStartCallback: OnCallback<StartBaseAudioMessage>[] = [];

  private onConnectedCallback: OnCallback<ConnectedBaseAudioMessage>[] = [];

  private onMediaCallback: OnCallback<MediaBaseAudioMessage>[] = [];

  private onStopCallback: OnCallback<StopBaseAudioMessage>[] = [];

  private onSetupCallback: OnCallback<SetupVoxrayMessage>[] = [];

  private onPromptCallback: OnCallback<PromptVoxrayMessage>[] = [];

  private onInterruptCallback: OnCallback<InterruptVoxrayMessage>[] = [];

  constructor(options: StreamSocketOptions) {
    this.logger = options.logger;
    this.socket = options.socket;

    this.socket.on('message', this.onMessage);
    this.socket.on('close', () => {
      this.logger.info('WebSocket connection closed');
    });
    this.socket.on('error', (err) => {
      this.logger.error(`WebSocket error: ${err}`);
    });
  }

  public close() {
    this.socket.close();
  }

  /**
   * Adds a callback to the connected event
   * @param callback
   */
  public onConnected = (callback: OnCallback<ConnectedBaseAudioMessage>) => {
    this.onConnectedCallback.push(callback);
  };

  /**
   * Adds a callback to the setup event
   * @param callback
   */
  public onSetup = (callback: OnCallback<SetupVoxrayMessage>) => {
    this.onSetupCallback.push(callback);
  };

  /**
   * Adds a callback to the prompt event
   * @param callback
   */
  public onPrompt = (callback: OnCallback<PromptVoxrayMessage>) => {
    this.onPromptCallback.push(callback);
  };

  /**
   * Adds a callback to the interrupt event
   * @param callback
   */
  public onInterrupt = (callback: OnCallback<InterruptVoxrayMessage>) => {
    this.onInterruptCallback.push(callback);
  };

  /**
   * Adds a callback to the start event
   * @param callback
   */
  public onStart = (callback: OnCallback<StartBaseAudioMessage>) => {
    this.onStartCallback.push(callback);
  };

  /**
   * Adds a callback to the media event
   * @param callback
   */
  public onMedia = (callback: OnCallback<MediaBaseAudioMessage>) => {
    this.onMediaCallback.push(callback);
  };

  /**
   * Adds a callback to the stop event
   * @param callback
   */
  public onStop = (callback: OnCallback<StopBaseAudioMessage>) => {
    this.onStopCallback.push(callback);
  };

  /**
   * Sends a message to the socket
   * @param messages
   * @param isLast
   */
  public send = (messages: string) => {
    this.logger.info('Sending message to socket: %s', messages);
    this.socket.send(messages);
  };

  /**
   * Routes the message to the correct callback
   * @param message
   */
  private onMessage = (message: unknown) => {
    const parse = () => {
      if (typeof message === 'string') {
        return JSON.parse(message.toString()) as VoxRayMessage;
      }
      return JSON.parse(message.toString()) as VoxRayMessage;
    };

    try {
      const parsed = parse();

      if (parsed.type === 'setup') {
        this.onSetupCallback.map((cb) => cb(parsed));
      } else if (parsed.type === 'prompt') {
        this.onPromptCallback.map((cb) => cb(parsed));
      } else if (parsed.type === 'interrupt') {
        this.onInterruptCallback.map((cb) => cb(parsed));
      } else {
        this.logger.error('Unknown event: %s', JSON.stringify(parsed));
      }
    } catch (error) {
      this.logger.error('Error parsing message1', { error });
      this.logger.error('Error is1 %s', JSON.stringify(error));
      this.logger.error('Message is1 %s', JSON.stringify(message));
    }
  };
}