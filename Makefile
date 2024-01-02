.PHONY: lint
lint:
	@npx eslint \
		--fix \
		index.js \
		examples \
		lib \
		test

.PHONY: test
test:
	@npx mocha \
		--bail \
		--timeout 20s \
		test/unit/*.js \
		test/acceptance/*.js
