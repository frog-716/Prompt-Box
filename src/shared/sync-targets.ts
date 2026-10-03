/** 同机共享构建的固定来源。公钥只固定扩展 ID，不是服务认证凭据。 */
export const SYNC_PROTOCOL_VERSION = 2;
export const SYNC_STORE_FORMAT_VERSION = 2;
export const SYNC_API_BASE = 'http://127.0.0.1:18763';
export const SYNC_HOST_PERMISSION = 'http://127.0.0.1:18763/*';
export const SYNC_MANIFEST_NAME = 'Prompt-Box';

export const SYNC_CLIENTS = {
  'chrome-sync': {
    extensionId: 'jembckdlcikbpapjcgikhagcggpigone',
    origin: 'chrome-extension://jembckdlcikbpapjcgikhagcggpigone',
    marker: 'PROMPT_BOX_CHROME_SYNC_TEST_V2',
    publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5Rb4oAgYO8qqfAJ4XlLQ9LuSQy7VDH00JouDDDeE1E7j5ST85ltqTGNH/y0MbseJIKDLAmIFOcBX8nkos1FmJmUUW8RoxUJ0a+kzF6NFxVo5e1//KoYVG3f37An7B/Q6Hd1eyUu7bhOB8pjuY5yjpayo02gLZpAV9M6wLvkCt36S7+PmoupCzeq+EkvDEQVRgb5F/92usdW8GW2UKVzzVlri//TLgkda0r8WTKZ6h2O5bvZ6GXVn7tN0SOZxJXtIoXN5PnKoND1lB5fjLbGyFUBpl2HIEmlI/PDuGfbZxmPlfBM38PByVE1QHEZzsEXui1QQBI8px8ccQgIXjW6K0QIDAQAB',
  },
  'gpt-sync': {
    extensionId: 'nkdicniilalfpddeodjnkeiiegniopem',
    origin: 'chrome-extension://nkdicniilalfpddeodjnkeiiegniopem',
    marker: 'PROMPT_BOX_GPT_SYNC_TEST_V2',
    publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqr25W6P5e4RJqlwPMxLlxVMSDYeOtEM45I3SMUktNlL5JMlK8/w3ypU73yoI7zXoCFMRroqMkg7KtNnAbkvctBQXozsW2cRzi+cfKb1zht6sRkDt9A7nZ1ZggUbhLR9AWe8wJuEnVSVo995qt72q1V7zucY1DYbn36bIVRL0lOVoi2ZCVt2Dji2TJDBg/V8JQENuMzweEhSvrEe8w2rQR9SX8tWJ/VYQ1Lx5mlPlZTWq3dRvqIUXqO+fWQ39ssj8Xg1c4T+YRuP8CtIVGp5lwToAzhsiVbSHSWW3dqv16uQFt2x+7sCaO9gRbOHhbgJfTutsfqP5KcD/pxUM7MrxawIDAQAB',
  },
} as const;

export type SyncClientId = keyof typeof SYNC_CLIENTS;
