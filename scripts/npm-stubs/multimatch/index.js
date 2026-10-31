// multimatch 8.0.0 by Sindre Sorhus (MIT, see license), with one default changed.
// web-ext builds its ignore list with path.resolve, so on Windows every pattern
// holds backslashes. minimatch 5 and later reads those as escapes, which leaves
// that list matching nothing, and web-ext would lint and package node_modules,
// .git and old archives. multimatch 6 on minimatch 3 treated them as separators.
import {minimatch} from 'minimatch';

export default function multimatch(list, patterns, options = {}) {
	list = [list].flat();
	patterns = [patterns].flat();

	if (list.length === 0 || patterns.length === 0) {
		return [];
	}

	const matchOptions = {windowsPathsNoEscape: process.platform === 'win32', ...options};
	let result = [];
	for (const item of list) {
		for (let pattern of patterns) {
			const negated = pattern[0] === '!';
			if (negated) {
				pattern = pattern.slice(1);
			}

			const matches = minimatch.match([item], pattern, matchOptions);
			result = negated
				? result.filter(entry => !matches.includes(entry))
				: [...new Set([...result, ...matches])];
		}
	}

	return result;
}
