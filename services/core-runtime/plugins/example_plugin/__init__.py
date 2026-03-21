from .my_custom_op import ExampleNoopOperation


def register_plugin(registry) -> None:
    registry.register("example_noop", ExampleNoopOperation)
