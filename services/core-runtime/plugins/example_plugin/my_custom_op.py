from core.ops.base import BaseOperation, PreApplyContext, StateDelta


class ExampleNoopOperation(BaseOperation):
    def apply(self, state):
        return StateDelta()

    def inverse(self, pre_context: PreApplyContext):
        return ExampleNoopOperation(
            op_type="example_noop",
            actor=self.actor,
            payload={},
            causation_id=self.op_id,
            correlation_id=self.correlation_id,
        )
