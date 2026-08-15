import { GlobalFonts } from '@napi-rs/canvas';
import { join } from 'node:path';

export const FONT_FAMILY = 'Inter, sans-serif';

GlobalFonts.registerFromPath(join(__dirname, '..', 'assets', 'fonts', 'Inter.ttf'), 'Inter');
