import axios from 'axios';
import { ZENDESK_CRED } from '../constants.js';

const createTicketData = (request) => {
  const { name, email, subject, description, priority, type, projectName } =
    request.body;

  return {
    ticket: {
      requester: {
        name,
        email,
      },
      subject,
      description,
      tags: [projectName, 'web_dashboard vrseBuilder'],
      custom_fields: [
        {
          id: ZENDESK_CRED.PROJECT_NAME_ID,
          value: projectName,
        },
        {
          id: ZENDESK_CRED.PRIORITY_ID,
          value: priority,
        },
        {
          id: ZENDESK_CRED.TYPE_ID,
          value: type,
        },
      ],
    },
  };
};

/**
 * Sends a ticket to Zendesk using mock data.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} - A promise that resolves when the ticket is created successfully.
 */
export const sendTicketMock = async (req, res) => {
  const ticketData = createTicketData(req);
  // Convert the auth token to base64 in order for authentication
  const auth = Buffer.from(
    `${ZENDESK_CRED.EMAIL}/token:${ZENDESK_CRED.API_TOKEN}`,
  ).toString('base64');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Basic ${auth}`,
  };

  await axios.post(ZENDESK_CRED.RAISE_REQUEST_URL, ticketData, {
    headers,
  });

  res.status(200).json({ message: 'Ticket created successfully' });
};
