import * as fs from "fs";
import * as _path from "path";
import { DataWriteOptions } from "obsidian";
import { useObsidianStore } from "src/store";
import { isNumber, isRegExp, isString } from "./lodash";
import { relative } from './path';
import { Alias } from '../obsidian_vue.type';

function readFile(path: string, pathResolveMode?: "static" | "relative"): Promise<string> {
	const { app } = useObsidianStore();  
  
	if (pathResolveMode === "static" && _path.isAbsolute(path)) {		
	  return Promise.resolve(fs.readFileSync(path, "utf8"));	  
	}
	  
	return app.vault.adapter.read(relative(path));
}

export const selectFileSync = async (path: string, start: number | string | RegExp = 1, end?: number | string | RegExp, pathResolveMode?: "static" | "relative") => {
	const content = await readFile(path, pathResolveMode);
	const lines = content.split("\n");
	const ret = lines;
	let startIndex = isNumber(start) ? start - 1 : 0;
	let endIndex = isNumber(end) ? end - 1 : lines.length - 1;
	if (isString(start)) {
		startIndex = lines.findIndex((line) => line.indexOf(start) > -1);
	}
	if (isRegExp(start)) {
		const reg = new RegExp(start.replace(/^\/(.*)\/$/, "$1"));
		startIndex = lines.findIndex((line) => reg.test(line));
	}

	// endIndex
	if (isString(end)) {
		if (end.startsWith("+")) {
			// increase by start
			endIndex = startIndex + Number(
				end.replace("+", "")
			);
		} else {
			endIndex = lines.findIndex((line) => line.indexOf(end) > -1);
		}
	}
	if (isRegExp(end)) {
		const reg = new RegExp(end.replace(/^\/(.*)\/$/, "$1"));
		endIndex = lines.findIndex((line) => reg.test(line));
	}

	return ret.slice(startIndex, endIndex + 1).join("\n");

};

export const write = async (path: string, contents: string, options?: DataWriteOptions) => {
	const { app } = useObsidianStore();
	return await app.vault.adapter.write(path, contents, options);
};

export const stat = (path: string) => fs.statSync(path);

const clearRelative = (p: string) => p
	.replace("../", "")
	.replace("..\\", "")
	.replace("./", "")
	.replace(".\\", "");

const match = (pattern: string, source: string) => {
	if (/^\/(.*)\/$/.test(pattern)) {
		const reg = new RegExp(pattern.replace(/^\/(.*)\/$/, "$1"));
		return reg.test(source);
	}

	return source.indexOf(pattern) > -1;
};

export async function list(options: {
	paths: string[];
	replacer?: (path: string) => string;
	recurs?: boolean;
	filesPath?: string[],
	alias: Alias;
}) {
	let {
		paths,
	} = options;
	const {
		recurs = true,
		alias,
		filesPath = [],
		replacer
	} = options;

	if (typeof alias === "string") {
		return filesPath;
	}

	if (paths.length === 0) {
		return filesPath;
	}
	const { app } = useObsidianStore();
	const { adapter } = app.vault;
	const [first] = paths;
	if (!first.startsWith("./") && !first.startsWith("../")) {
		paths = paths.map(p => relative(p));
	}

	for (let i = 0; i < paths.length; i++) {
		const path = paths[i];
		const { files, folders } = await adapter.list(path);
		const { folders: filterFolders, files: filterFiles } = filterPathByAlias(alias, folders, files);

		filterFiles.forEach(
			(p) => filesPath.push(
				replacer ? replacer(clearRelative(p)) : clearRelative(p)
			)
		);
		if (filterFolders.length > 0 && recurs) {
			await list({
				...options,
				paths: filterFolders,
				filesPath
			});
		}
	}

	return filesPath;
}

export function filterPathByAlias(aliasObj: Alias, folders: string[], files: string[]) {
	if (typeof aliasObj === "string") {
		return {
			folders: [],
			files: []
		};
	}

	const {
		include = [], exclude = [],
		includeFile = [], excludeFile = [],
	} = aliasObj;

	const includeFolders = include.length === 0 ? folders : folders.filter(source => include.some(pattern => match(pattern, source)));
	const excludeFolders = exclude.length === 0 ? includeFolders : includeFolders.filter(source => !exclude.some(pattern => match(pattern, source)));

	const includeFiles = includeFile.length === 0 ? files : files.filter(source => includeFile.some(pattern => match(pattern, source)));
	const excludeFiles = excludeFile.length === 0 ? includeFiles : includeFiles.filter(source => !excludeFile.some(pattern => match(pattern, source)));

	return {
		folders: excludeFolders,
		files: excludeFiles
	};
}

export function watchFile(filename: string, listener: () => void) {
	return fs.watchFile(filename, listener);
}

export function unwatchFile(filename: string, listener: () => void) {
	return fs.unwatchFile(filename, listener);
}

export function watch(filename: string, listener: (eventType: string, filename: string) => void, options: fs.WatchOptions = {
	recursive: true
}) {
	const abortSignal = new AbortController();
	options.signal = abortSignal.signal;
	fs.watch(filename, options, listener);
	return abortSignal;
}
