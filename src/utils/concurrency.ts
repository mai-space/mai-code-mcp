import pLimit from 'p-limit';

export async function batchProcess<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const limit = pLimit(concurrency);
  return Promise.all(items.map((item) => limit(() => processor(item))));
}

export { pLimit };
