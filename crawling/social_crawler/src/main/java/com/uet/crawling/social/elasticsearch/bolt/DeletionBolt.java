package com.uet.crawling.social.elasticsearch.bolt;

import java.io.IOException;
import java.lang.invoke.MethodHandles;
import java.util.Map;

import org.apache.storm.task.OutputCollector;
import org.apache.storm.task.TopologyContext;
import org.apache.storm.topology.OutputFieldsDeclarer;
import org.apache.storm.topology.base.BaseRichBolt;
import org.apache.storm.tuple.Tuple;
import org.elasticsearch.action.delete.DeleteRequest;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.LoggerFactory;

import com.uet.crawling.social.Metadata;
import com.uet.crawling.social.elasticsearch.ElasticSearchConnection;
import com.uet.crawling.social.util.ConfUtils;

/**
 * Deletes documents to ElasticSearch. This should be connected to the
 * StatusUpdaterBolt via the 'deletion' stream and will remove the documents
 * with a status of ERROR one by one. Note that this component will also try to
 * delete documents even though they were never indexed and it currently won't
 * delete documents which were indexed under the Node.
 */
public class DeletionBolt extends BaseRichBolt {

    static final org.slf4j.Logger LOG = LoggerFactory.getLogger(MethodHandles
            .lookup().lookupClass());

    private static final String ESBoltType = "indexer";

    private OutputCollector _collector;

    private String indexName;
    private String docType;

    private RestHighLevelClient client;

    public DeletionBolt() {
    }

    /** Sets the index name instead of taking it from the configuration. **/
    public DeletionBolt(String indexName) {
        this.indexName = indexName;
    }

    @SuppressWarnings({ "unchecked", "rawtypes" })
    @Override
    public void prepare(Map conf, TopologyContext context,
            OutputCollector collector) {
        _collector = collector;
        if (indexName == null) {
            indexName = ConfUtils.getString(conf,
                    IndexerBolt.ESIndexNameParamName, "fetcher");
        }
        docType = ConfUtils.getString(conf, IndexerBolt.ESDocTypeParamName,
                "doc");
        client = ElasticSearchConnection.getClient(conf, ESBoltType);
    }

    @Override
    public void cleanup() {
        if (client != null)
            try {
                client.close();
            } catch (IOException e) {
            }
    }

    @Override
    public void execute(Tuple tuple) {
        String node = tuple.getStringByField("node");
        Metadata metadata = (Metadata) tuple.getValueByField("metadata");

        // keep it simple for now and ignore cases where the canonical URL was
        // used
        String sha256hex = org.apache.commons.codec.digest.DigestUtils
                .sha256Hex(node);
        DeleteRequest dr = new DeleteRequest(getIndexName(metadata), docType,
                sha256hex);
        try {
            client.delete(dr);
        } catch (IOException e) {
            _collector.fail(tuple);
            LOG.error("Exception caught while deleting", e);
            return;
        }
        _collector.ack(tuple);
    }

    @Override
    public void declareOutputFields(OutputFieldsDeclarer arg0) {
        // none
    }

    /**
     * Must be overridden for implementing custom index names based on some
     * metadata information By Default, indexName coming from config is used
     */
    protected String getIndexName(Metadata m) {
        return indexName;
    }

}
