export function summarizeBulkDelivery(results) {
  const sent = results.filter(item => item.status === 'sent');
  const failed = results.filter(item => item.status !== 'sent');
  return {
    sent, failed,
    status: results.length > 0 && failed.length === 0 ? 'sent' : 'failed',
    error: failed.length ? `${failed.length} delivery attempt(s) failed: ${failed[0].error || 'Delivery was not confirmed.'}` : results.length ? null : 'No recipients were supplied.',
  };
}
