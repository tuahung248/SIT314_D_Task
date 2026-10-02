/**
 * SQS Competitive Consumer
 * Long-polls an SQS queue for sensor events.
 * Supports multiple concurrent consumers (ECS tasks) without duplication.
 */

const AWS = require('aws-sdk');

class SQSConsumer {
  constructor(queueUrl, handler, options = {}) {
    this.queueUrl = queueUrl;
    this.handler = handler;
    this.running = false;
    this.batchSize = options.batchSize || 10;
    this.waitTimeSeconds = options.waitTimeSeconds || 20;
    this.visibilityTimeout = options.visibilityTimeout || 30;

    this.sqs = new AWS.SQS({
      region: process.env.AWS_REGION || 'ap-southeast-2'
    });
  }

  async start() {
    this.running = true;
    console.log(`[SQS Consumer] Polling ${this.queueUrl}`);

    while (this.running) {
      try {
        const response = await this.sqs
          .receiveMessage({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: this.batchSize,
            WaitTimeSeconds: this.waitTimeSeconds,
            VisibilityTimeout: this.visibilityTimeout,
            AttributeNames: ['ApproximateReceiveCount']
          })
          .promise();

        if (response.Messages && response.Messages.length > 0) {
          console.log(`[SQS Consumer] Received ${response.Messages.length} messages`);

          for (const message of response.Messages) {
            try {
              const body = JSON.parse(message.Body);
              await this.handler(body);

              // Delete message after successful processing
              await this.sqs
                .deleteMessage({
                  QueueUrl: this.queueUrl,
                  ReceiptHandle: message.ReceiptHandle
                })
                .promise();
            } catch (err) {
              console.error(
                '[SQS Consumer] Error processing message:',
                err.message
              );
              // Message will become visible again after visibility timeout
            }
          }
        }
      } catch (err) {
        console.error('[SQS Consumer] Poll error:', err.message);
        // Backoff on error
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  stop() {
    this.running = false;
    console.log('[SQS Consumer] Stopped');
  }
}

module.exports = { SQSConsumer };
