import { AsyncLocalStorage } from 'async_hooks';

// Lưu trữ Request ID hoặc bất kỳ thông tin nào của Request hiện tại
export const requestContext = new AsyncLocalStorage<Map<string, string>>();
