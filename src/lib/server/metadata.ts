import { parseFile } from 'music-metadata';
import path from 'node:path';
import { createLogger } from './logger.js';

const log = createLogger('metadata');

const SUPPORTED_EXTENSIONS = new Set(['.flac', '.mp3', '.ogg', '.aac', '.wav', '.m4a']);

export interface TrackMetadata {
	title: string | null;
	artist: string | null;
	album: string | null;
	albumArtist: string | null;
	genre: string | null;
	trackNumber: number | null;
	discNumber: number | null;
	year: number | null;
	duration: number | null;
	format: string;
	bitrate: number | null;
	sampleRate: number | null;
}

export function isSupportedAudioFile(filePath: string): boolean {
	const ext = path.extname(filePath).toLowerCase();
	return SUPPORTED_EXTENSIONS.has(ext);
}

export function getFormatFromExtension(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase().slice(1);
	const formatMap: Record<string, string> = {
		flac: 'FLAC',
		mp3: 'MP3',
		ogg: 'OGG',
		aac: 'AAC',
		wav: 'WAV',
		m4a: 'AAC'
	};
	return formatMap[ext] || ext.toUpperCase();
}

export interface CoverData {
	data: Buffer;
	mimeType: string;
}

export async function extractCover(filePath: string): Promise<CoverData | null> {
	try {
		const metadata = await parseFile(filePath, { skipCovers: false, duration: false });
		const picture = metadata.common.picture?.[0];
		if (!picture) return null;
		return {
			data: Buffer.from(picture.data),
			mimeType: picture.format || 'image/jpeg'
		};
	} catch {
		return null;
	}
}

export async function extractMetadata(filePath: string): Promise<TrackMetadata | null> {
	try {
		const metadata = await parseFile(filePath, { skipCovers: true });
		const { common, format } = metadata;

		return {
			title: common.title || null,
			artist: common.artist || null,
			album: common.album || null,
			albumArtist: common.albumartist || null,
			genre: common.genre?.[0] || null,
			trackNumber: common.track?.no || null,
			discNumber: common.disk?.no || null,
			year: common.year || null,
			duration: format.duration || null,
			format: getFormatFromExtension(filePath),
			bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
			sampleRate: format.sampleRate || null
		};
	} catch (err) {
		log.warn('Failed to extract metadata from file', {
			file: filePath,
			error: err instanceof Error ? err.message : String(err)
		});
		return null;
	}
}
