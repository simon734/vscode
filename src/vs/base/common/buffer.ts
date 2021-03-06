/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import * as streams from 'vs/base/common/stream';

declare var Buffer: any;

const hasBuffer = (typeof Buffer !== 'undefined');
const hasTextEncoder = (typeof TextEncoder !== 'undefined');
const hasTextDecoder = (typeof TextDecoder !== 'undefined');

let textEncoder: TextEncoder | null;
let textDecoder: TextDecoder | null;

export class VSBuffer {

	static alloc(byteLength: number): VSBuffer {
		if (hasBuffer) {
			return new VSBuffer(Buffer.allocUnsafe(byteLength));
		} else {
			return new VSBuffer(new Uint8Array(byteLength));
		}
	}

	static wrap(actual: Uint8Array): VSBuffer {
		if (hasBuffer && !(Buffer.isBuffer(actual))) {
			// https://nodejs.org/dist/latest-v10.x/docs/api/buffer.html#buffer_class_method_buffer_from_arraybuffer_byteoffset_length
			// Create a zero-copy Buffer wrapper around the ArrayBuffer pointed to by the Uint8Array
			actual = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength);
		}
		return new VSBuffer(actual);
	}

	static fromString(source: string): VSBuffer {
		if (hasBuffer) {
			return new VSBuffer(Buffer.from(source));
		} else if (hasTextEncoder) {
			if (!textEncoder) {
				textEncoder = new TextEncoder();
			}
			return new VSBuffer(textEncoder.encode(source));
		} else {
			return new VSBuffer(strings.encodeUTF8(source));
		}
	}

	static concat(buffers: VSBuffer[], totalLength?: number): VSBuffer {
		if (typeof totalLength === 'undefined') {
			totalLength = 0;
			for (let i = 0, len = buffers.length; i < len; i++) {
				totalLength += buffers[i].byteLength;
			}
		}

		const ret = VSBuffer.alloc(totalLength);
		let offset = 0;
		for (let i = 0, len = buffers.length; i < len; i++) {
			const element = buffers[i];
			ret.set(element, offset);
			offset += element.byteLength;
		}

		return ret;
	}

	readonly buffer: Uint8Array;
	readonly byteLength: number;

	private constructor(buffer: Uint8Array) {
		this.buffer = buffer;
		this.byteLength = this.buffer.byteLength;
	}

	toString(): string {
		if (hasBuffer) {
			return this.buffer.toString();
		} else if (hasTextDecoder) {
			if (!textDecoder) {
				textDecoder = new TextDecoder();
			}
			return textDecoder.decode(this.buffer);
		} else {
			return strings.decodeUTF8(this.buffer);
		}
	}

	slice(start?: number, end?: number): VSBuffer {
		// IMPORTANT: use subarray instead of slice because TypedArray#slice
		// creates shallow copy and NodeBuffer#slice doesn't. The use of subarray
		// ensures the same, performant, behaviour.
		return new VSBuffer(this.buffer.subarray(start!/*bad lib.d.ts*/, end));
	}

	set(array: VSBuffer, offset?: number): void {
		this.buffer.set(array.buffer, offset);
	}

	readUInt32BE(offset: number): number {
		return readUInt32BE(this.buffer, offset);
	}

	writeUInt32BE(value: number, offset: number): void {
		writeUInt32BE(this.buffer, value, offset);
	}

	readUInt8(offset: number): number {
		return readUInt8(this.buffer, offset);
	}

	writeUInt8(value: number, offset: number): void {
		writeUInt8(this.buffer, value, offset);
	}
}

export function readUInt32BE(source: Uint8Array, offset: number): number {
	return (
		source[offset] * 2 ** 24
		+ source[offset + 1] * 2 ** 16
		+ source[offset + 2] * 2 ** 8
		+ source[offset + 3]
	);
}

export function writeUInt32BE(destination: Uint8Array, value: number, offset: number): void {
	destination[offset + 3] = value;
	value = value >>> 8;
	destination[offset + 2] = value;
	value = value >>> 8;
	destination[offset + 1] = value;
	value = value >>> 8;
	destination[offset] = value;
}

function readUInt8(source: Uint8Array, offset: number): number {
	return source[offset];
}

function writeUInt8(destination: Uint8Array, value: number, offset: number): void {
	destination[offset] = value;
}

export interface VSBufferReadable extends streams.Readable<VSBuffer> { }

export interface VSBufferReadableStream extends streams.ReadableStream<VSBuffer> { }

export interface VSBufferWriteableStream extends streams.WriteableStream<VSBuffer> { }

export function readableToBuffer(readable: VSBufferReadable): VSBuffer {
	return streams.consumeReadable<VSBuffer>(readable, chunks => VSBuffer.concat(chunks));
}

export function bufferToReadable(buffer: VSBuffer): VSBufferReadable {
	return streams.toReadable<VSBuffer>(buffer);
}

export function streamToBuffer(stream: streams.ReadableStream<VSBuffer>): Promise<VSBuffer> {
	return streams.consumeStream<VSBuffer>(stream, chunks => VSBuffer.concat(chunks));
}

export function bufferToStream(buffer: VSBuffer): streams.ReadableStream<VSBuffer> {
	return streams.toStream<VSBuffer>(buffer, chunks => VSBuffer.concat(chunks));
}

export function streamToBufferReadableStream(stream: streams.ReadableStreamEvents<Uint8Array | string>): streams.ReadableStream<VSBuffer> {
	return streams.transform<Uint8Array | string, VSBuffer>(stream, { data: data => typeof data === 'string' ? VSBuffer.fromString(data) : VSBuffer.wrap(data) }, chunks => VSBuffer.concat(chunks));
}

export function newWriteableBufferStream(): streams.WriteableStream<VSBuffer> {
	return streams.newWriteableStream<VSBuffer>(chunks => VSBuffer.concat(chunks));
}
