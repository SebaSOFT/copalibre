import { createIntl, createIntlCache } from 'react-intl';
import { messages } from '../i18n/messages.en.js';
import { ControlApiError } from './api-client.js';
import { ERROR_CODE_MESSAGES, errorPresentation } from './error-messages.js';

const intl = createIntl(
  {
    locale: 'en',
    messages: Object.fromEntries(
      Object.values(messages).map((descriptor) => [descriptor.id, descriptor.defaultMessage]),
    ),
  },
  createIntlCache(),
);

describe('API error localization', () => {
  it('maps every stable API category to a translated operator message', () => {
    expect(ERROR_CODE_MESSAGES).toMatchObject({
      'bad-request': expect.any(Object),
      'club-not-found': expect.any(Object),
      'registration-conflict': expect.any(Object),
      'service-unavailable': expect.any(Object),
    });
    expect(
      errorPresentation(intl, new ControlApiError(403, 'raw server wording', 'forbidden')),
    ).toEqual({ message: 'You do not have permission to perform this action.' });
  });

  it('maps a controller-scoped code through its stable status family', () => {
    expect(
      errorPresentation(intl, new ControlApiError(404, 'No club here', 'club-not-found')),
    ).toEqual({ message: 'The requested item could not be found.' });
  });

  it('uses generic translated copy and retains raw details for an unmapped code', () => {
    expect(
      errorPresentation(
        intl,
        new ControlApiError(409, 'Bracket is already final', 'bracket-final'),
      ),
    ).toEqual({
      message: 'The request could not be completed. Try again.',
      details: { errorCode: 'bracket-final', message: 'Bracket is already final' },
    });
  });

  it('does not infer a translation for an unregistered status-suffixed code', () => {
    expect(
      errorPresentation(intl, new ControlApiError(400, 'Raw future detail', 'future-bad-request')),
    ).toMatchObject({
      message: 'The request could not be completed. Try again.',
      details: { errorCode: 'future-bad-request' },
    });
  });

  it('uses generic translated copy for non-API failures without exposing details', () => {
    expect(errorPresentation(intl, new Error('secret transport detail'))).toEqual({
      message: 'The request could not be completed. Try again.',
    });
  });
});
