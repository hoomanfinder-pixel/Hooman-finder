# Yard/fence hard exclusion is deferred

RescueGroups `isYardRequired` and `fenceNeeds` values currently remain matching inputs, but they must not remove a dog from eligible results.

A production audit found at least one direct contradiction: a dog marked `isYardRequired=true` whose source biography explicitly allowed a home without a yard when adequate walks were provided. Several additional records used preference language such as “preferred,” “would love,” “would benefit,” or “ideal” despite structured values that appeared mandatory.

Until the source semantics can distinguish a true adoption requirement from a preference or recommendation, yard/fence information remains a scoring signal with the existing caution behavior. Future hard filtering requires a separate, explicit verified-requirement classification. This task intentionally does not build that classification.
