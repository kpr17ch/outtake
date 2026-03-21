# plugins/ — Extension Point for Custom Operations

This package provides the plugin system that allows external partners to register their own operation types without modifying core code.

## Role in the System

The plugin system connects to the core via `OperationRegistry`. When the application starts, it discovers plugins through `pyproject.toml` entry points and calls their `register_plugin()` function, which registers new operation types with the registry.

```
pyproject.toml entry point → plugin.__init__.register_plugin(registry) → registry.register("my_op", MyOp)
```

This follows the Open/Closed principle: the core is closed for modification but open for extension.

## How It Works

### 1. Define a custom operation

Create a class inheriting from `BaseOperation`:

```python
# my_plugin/custom_op.py
from core.ops.base import BaseOperation, PreApplyContext, StateDelta

class MyCustomOperation(BaseOperation):
    def apply(self, state):
        # mutate state
        return StateDelta()

    def inverse(self, pre_context):
        # return the inverse operation
        return MyCustomOperation(
            op_type="my_custom_op", actor=self.actor,
            payload={}, causation_id=self.op_id,
        )
```

### 2. Register via entry point

In the plugin's `__init__.py`:
```python
from .custom_op import MyCustomOperation

def register_plugin(registry):
    registry.register("my_custom_op", MyCustomOperation)
```

In `pyproject.toml`:
```toml
[project.entry-points."outtake.operation_plugins"]
my_plugin = "my_plugin:register_plugin"
```

### 3. Discovery at runtime

The application (not the core) iterates entry points and calls `register_plugin`:
```python
from importlib.metadata import entry_points
from core.ops.registry import OperationRegistry

registry = OperationRegistry()
for ep in entry_points(group="outtake.operation_plugins"):
    ep.load()(registry)
```

---

## Files

### `__init__.py`

Exports `example_plugin` module name.

### `example_plugin/__init__.py`

Registers `ExampleNoopOperation` under the type `"example_noop"`:
```python
def register_plugin(registry):
    registry.register("example_noop", ExampleNoopOperation)
```

### `example_plugin/my_custom_op.py`

A minimal no-op operation that demonstrates the plugin contract:
- `apply()` returns an empty `StateDelta`
- `inverse()` returns another `ExampleNoopOperation`

This serves as a template for partners building custom operations.

### `README.md`

Instructions for external partners on how to create and register plugins.
