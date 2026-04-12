// 1. Chỉ định nghĩa Hành động (Không kèm trạng thái)
export const LOG_ACTIONS = {
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  TAX_SUBMIT: 'TAX_SUBMIT',
  TAX_CLOSE_PERIOD: 'TAX_CLOSE_PERIOD',
} as const;

// 2. Định nghĩa Trạng thái chuẩn chung cho toàn bộ App
export enum LOG_STATUS {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  START = 'START',
}
