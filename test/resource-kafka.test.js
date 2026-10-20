const {chartValues, render, renderFailure, resource} = require('./helpers/helm');
const chart = 'charts/resource/kafka';
test('Kafka Resource uses KRaft, retained storage and namespace-local connection configuration', () => {
  const values = chartValues(chart);
  values.clusterName = 'orders-dev';
  const objects = render(chart, values);
  expect(resource(objects, 'Kafka').spec.kafka.config['offsets.topic.replication.factor']).toBe(1);
  expect(resource(objects, 'KafkaNodePool').spec).toMatchObject({roles: ['controller', 'broker'], storage: {deleteClaim: false}});
  expect(resource(objects, 'ConfigMap').data.KAFKA_BOOTSTRAP_SERVERS).toBe('orders-dev-kafka-bootstrap:9092');
  expect(resource(objects, 'Kafka').spec.kafka.listeners[0].configuration.networkPolicyPeers).toEqual([{podSelector: {}}]);
  values.replicas = 3;
  expect(resource(render(chart, values), 'Kafka').spec.kafka.config['min.insync.replicas']).toBe(2);
  values.replicas = 2;
  expect(renderFailure(chart, values)).toContain('replicas');
});
