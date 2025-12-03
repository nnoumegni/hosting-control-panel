import { serverSettingsSchema, updateServerSettingsSchema } from '@hosting/common';

export const getServerSettingsValidation = {};

export const updateServerSettingsValidation = {
  body: updateServerSettingsSchema,
};

export type ServerSettingsResponse = typeof serverSettingsSchema['_output'];
export type UpdateServerSettingsBody = typeof updateServerSettingsSchema['_input'];

