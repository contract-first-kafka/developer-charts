SHELL := /usr/bin/env bash
.PHONY: test release-check test-install test-clean

test: test-install
	npm test --prefix test
	npm ci --prefix charts/api/openapi/files/asyncapi --ignore-scripts --no-audit --no-fund
	node --test test/asyncapi-validation.cjs

release-check: test
	npm run --prefix test test:release
	node test/validate-release.js

test-install:
	npm ci --prefix test --loglevel=error

test-clean:
	rm -rf test/node_modules
