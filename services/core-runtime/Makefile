.PHONY: lint test contract-test replay-test

lint:
	python -m py_compile core/domain/*.py core/ops/*.py core/history/*.py core/serialization/*.py events/*.py

test:
	pytest -q

contract-test:
	pytest -q tests/contract

replay-test:
	pytest -q tests/replay
