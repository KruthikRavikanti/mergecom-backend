export interface ContactRequest {
  email: string;
  message: string;
  name: string;
}

export function readFormString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export function submitContactRequest(request: ContactRequest): Promise<never> {
  void request;
  return Promise.reject(
    new Error(
      'Contact delivery is not connected yet. Email support through your approved internal channel.',
    ),
  );
}

export function submitSupportRequest(request: ContactRequest): Promise<never> {
  void request;
  return Promise.reject(
    new Error(
      'Support ticket delivery is not connected yet. Your request was not submitted.',
    ),
  );
}
