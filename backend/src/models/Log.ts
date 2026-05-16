import mongoose, { Schema, Document } from 'mongoose';

export interface ILog extends Document {
  timestamp: Date;
  level: string;
  service: string;
  message: string;
  containerId?: string;
  metadata?: any;
}

const LogSchema: Schema = new Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  level: { type: String, default: 'info', index: true },
  service: { type: String, required: true, index: true },
  message: { type: String, required: true },
  containerId: { type: String },
  metadata: { type: Schema.Types.Mixed },
}, {
  // Use a capped collection to keep only the last 50,000 logs or 50MB
  capped: { size: 52428800, max: 50000 }
});

export default mongoose.model<ILog>('Log', LogSchema);
