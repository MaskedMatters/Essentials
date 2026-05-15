import mongoose from 'mongoose';

export interface ISSOConfig {
  _id?: string;
  enabled: boolean;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  groupClaimName: string;
  adminGroupName: string;
  autoProvision: boolean;
  autoLogin: boolean;
}

const ssoConfigSchema = new mongoose.Schema<ISSOConfig>({
  enabled: { type: Boolean, default: false },
  issuerUrl: { type: String, default: '' },
  clientId: { type: String, default: '' },
  clientSecret: { type: String, default: '' },
  scopes: { type: String, default: 'openid profile email' },
  groupClaimName: { type: String, default: 'groups' },
  adminGroupName: { type: String, default: 'admins' },
  autoProvision: { type: Boolean, default: false },
  autoLogin: { type: Boolean, default: false },
}, { timestamps: true });

export const SSOConfig = mongoose.model<ISSOConfig>('SSOConfig', ssoConfigSchema);
