
package com.uet.crawling.social.elasticsearch.persistence;

import static org.elasticsearch.index.query.QueryBuilders.boolQuery;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import org.apache.commons.lang.StringUtils;
import org.apache.storm.spout.SpoutOutputCollector;
import org.apache.storm.task.TopologyContext;
import org.apache.storm.tuple.Values;
import org.elasticsearch.action.ActionListener;
import org.elasticsearch.action.search.SearchRequest;
import org.elasticsearch.action.search.SearchResponse;
import org.elasticsearch.action.search.SearchType;
import org.elasticsearch.index.query.QueryBuilder;
import org.elasticsearch.index.query.QueryBuilders;
import org.elasticsearch.search.SearchHit;
import org.elasticsearch.search.aggregations.AggregationBuilders;
import org.elasticsearch.search.aggregations.Aggregations;
import org.elasticsearch.search.aggregations.BucketOrder;
import org.elasticsearch.search.aggregations.bucket.SingleBucketAggregation;
import org.elasticsearch.search.aggregations.bucket.sampler.DiversifiedAggregationBuilder;
import org.elasticsearch.search.aggregations.bucket.terms.Terms;
import org.elasticsearch.search.aggregations.bucket.terms.Terms.Bucket;
import org.elasticsearch.search.aggregations.bucket.terms.TermsAggregationBuilder;
import org.elasticsearch.search.aggregations.metrics.min.MinAggregationBuilder;
import org.elasticsearch.search.aggregations.metrics.tophits.TopHits;
import org.elasticsearch.search.aggregations.metrics.tophits.TopHitsAggregationBuilder;
import org.elasticsearch.search.builder.SearchSourceBuilder;
import org.elasticsearch.search.sort.FieldSortBuilder;
import org.elasticsearch.search.sort.SortBuilders;
import org.elasticsearch.search.sort.SortOrder;
import org.joda.time.format.ISODateTimeFormat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.uet.crawling.social.Metadata;
import com.uet.crawling.social.util.ConfUtils;

/**
 * Spout which pulls Node from an ES index. Use a single instance unless you use
 * 'es.status.routing' with the StatusUpdaterBolt, in which case you need to
 * have exactly the same number of spout instances as ES shards. Guarantees a
 * good mix of Nodes by aggregating them by an arbitrary field e.g.
 * metadata.type.
 **/
@SuppressWarnings("serial")
public class AggregationSpout extends AbstractSpout implements
        ActionListener<SearchResponse> {

    private static final Logger LOG = LoggerFactory
            .getLogger(AggregationSpout.class);

    private static final String ESStatusSampleParamName = "es.status.sample";
    private static final String ESMostRecentDateIncreaseParamName = "es.status.recentDate.increase";
    private static final String ESMostRecentDateMinGapParamName = "es.status.recentDate.min.gap";

    private boolean sample = false;

    private int recentDateIncrease = -1;
    private int recentDateMinGap = -1;

    @Override
    public void open(Map stormConf, TopologyContext context,
            SpoutOutputCollector collector) {
        sample = ConfUtils.getBoolean(stormConf, ESStatusSampleParamName,
                sample);
        recentDateIncrease = ConfUtils.getInt(stormConf,
                ESMostRecentDateIncreaseParamName, recentDateIncrease);
        recentDateMinGap = ConfUtils.getInt(stormConf,
                ESMostRecentDateMinGapParamName, recentDateMinGap);
        super.open(stormConf, context, collector);
    }

    @Override
    protected void populateBuffer() {

        if (lastDate == null) {
            lastDate = new Date();
        }

        String formattedLastDate = ISODateTimeFormat.dateTimeNoMillis().print(
                lastDate.getTime());

        LOG.info("{} Populating buffer with nextFetchDate <= {}", logIdprefix,
                formattedLastDate);

        QueryBuilder queryBuilder = QueryBuilders.rangeQuery("nextFetchDate")
                .lte(formattedLastDate);

        if (filterQuery != null) {
            queryBuilder = boolQuery().must(queryBuilder).filter(
                    QueryBuilders.queryStringQuery(filterQuery));
        }

        SearchRequest request = new SearchRequest(indexName).types(docType)
                .searchType(SearchType.QUERY_THEN_FETCH);

        SearchSourceBuilder sourceBuilder = new SearchSourceBuilder();
        sourceBuilder.query(queryBuilder);
        sourceBuilder.from(0);
        sourceBuilder.size(0);
        sourceBuilder.explain(false);
        sourceBuilder.trackTotalHits(false);

        TermsAggregationBuilder aggregations = AggregationBuilders
                .terms("partition").field(partitionField).size(maxBucketNum);

        TopHitsAggregationBuilder tophits = AggregationBuilders.topHits("docs")
                .size(maxNodesPerBucket).explain(false);
        // sort within a bucket
        if (StringUtils.isNotBlank(bucketSortField)) {
            FieldSortBuilder sorter = SortBuilders.fieldSort(bucketSortField)
                    .order(SortOrder.ASC);
            tophits.sort(sorter);
        }

        aggregations.subAggregation(tophits);

        // sort between buckets
        if (StringUtils.isNotBlank(totalSortField)) {
            MinAggregationBuilder minBuilder = AggregationBuilders.min(
                    "top_hit").field(totalSortField);
            aggregations.subAggregation(minBuilder);
            aggregations.order(BucketOrder.aggregation("top_hit", true));
        }

        if (sample) {
            DiversifiedAggregationBuilder sab = new DiversifiedAggregationBuilder(
                    "sample");
            sab.field(partitionField).maxDocsPerValue(maxNodesPerBucket);
            sab.shardSize(maxNodesPerBucket * maxBucketNum);
            sab.subAggregation(aggregations);
            sourceBuilder.aggregation(sab);
        } else {
            sourceBuilder.aggregation(aggregations);
        }

        request.source(sourceBuilder);

        // https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-preference.html
        // _shards:2,3
        if (shardID != -1) {
            request.preference("_shards:" + shardID);
        }

        // dump query to log
        LOG.debug("{} ES query {}", logIdprefix, request.toString());

        isInQuery.set(true);
        client.searchAsync(request, this);
    }

    @Override
    public void onFailure(Exception arg0) {
        LOG.error("Exception with ES query", arg0);
        isInQuery.set(false);
    }

    @Override
    public void onResponse(SearchResponse response) {
        long timeTaken = System.currentTimeMillis() - timeLastQuery;

        Aggregations aggregs = response.getAggregations();

        if (aggregs == null) {
            isInQuery.set(false);
            return;
        }

        SingleBucketAggregation sample = aggregs.get("sample");
        if (sample != null) {
            aggregs = sample.getAggregations();
        }

        Terms agg = aggregs.get("partition");

        int numhits = 0;
        int numBuckets = 0;
        int alreadyprocessed = 0;

        Date mostRecentDateFound = null;

        SimpleDateFormat formatter = new SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss.SSSX");

        synchronized (buffer) {
            // For each entry
            Iterator<Terms.Bucket> iterator = (Iterator<Bucket>) agg.getBuckets().iterator();
            while (iterator.hasNext()) {
                Terms.Bucket entry = iterator.next();
                String key = (String) entry.getKey(); // bucket key
                long docCount = entry.getDocCount(); // Doc count

                int hitsForThisBucket = 0;

                // filter results so that we don't include Nodes we are already
                // being processed
                TopHits topHits = entry.getAggregations().get("docs");
                for (SearchHit hit : topHits.getHits().getHits()) {
                    hitsForThisBucket++;

                    Map<String, Object> keyValues = hit.getSourceAsMap();
                    String node = (String) keyValues.get("node");
                    LOG.debug("{} -> id [{}], _source [{}]", logIdprefix,
                            hit.getId(), hit.getSourceAsString());

                    // consider only the first document of the last bucket
                    // for optimising the nextFetchDate
                    if (hitsForThisBucket == 1 && !iterator.hasNext()) {
                        String strDate = (String) keyValues.get("nextFetchDate");
                        try {
                            mostRecentDateFound = formatter.parse(strDate);
                        } catch (ParseException e) {
                            throw new RuntimeException("can't parse date :" + strDate);
                        }
                    }

                    // is already being processed - skip it!
                    if (beingProcessed.containsKey(node)) {
                        alreadyprocessed++;
                        continue;
                    }

                    Metadata metadata = fromKeyValues(keyValues);
                    buffer.add(new Values(node, metadata));
                }

                if (hitsForThisBucket > 0)
                    numBuckets++;

                numhits += hitsForThisBucket;

                LOG.debug("{} key [{}], hits[{}], doc_count [{}]", logIdprefix,
                        key, hitsForThisBucket, docCount, alreadyprocessed);
            }

            // Shuffle the Nodes so that we don't get blocks of Nodes from the
            // same type
            Collections.shuffle((List) buffer);
        }

        LOG.info(
                "{} ES query returned {} hits from {} buckets in {} msec with {} already being processed",
                logIdprefix, numhits, numBuckets, timeTaken, alreadyprocessed);

        // reset the value for next fetch date if the previous one is too old
        if (resetFetchDateAfterNSecs != -1) {
            Calendar diffCal = Calendar.getInstance();
            diffCal.setTime(lastDate);
            diffCal.add(Calendar.SECOND, resetFetchDateAfterNSecs);
            // compare to now
            if (diffCal.before(Calendar.getInstance())) {
                LOG.info(
                        "{} lastDate set to null based on resetFetchDateAfterNSecs {}",
                        logIdprefix, resetFetchDateAfterNSecs);
                lastDate = null;
            }
        }

        // optimise the nextFetchDate by getting the most recent value
        // returned in the query and add to it, unless the previous value is
        // within n mins in which case we'll keep it
        else if (mostRecentDateFound != null && recentDateIncrease >= 0) {
            Calendar potentialNewDate = Calendar.getInstance();
            potentialNewDate.setTime(mostRecentDateFound);
            potentialNewDate.add(Calendar.MINUTE, recentDateIncrease);
            Date oldDate = null;
            // check boundaries
            if (this.recentDateMinGap > 0) {
                Calendar low = Calendar.getInstance();
                low.setTime(lastDate);
                low.add(Calendar.MINUTE, -recentDateMinGap);
                Calendar high = Calendar.getInstance();
                high.setTime(lastDate);
                high.add(Calendar.MINUTE, recentDateMinGap);
                if (high.before(potentialNewDate)
                        || low.after(potentialNewDate)) {
                    oldDate = lastDate;
                }
            } else {
                oldDate = lastDate;
            }
            if (oldDate != null) {
                lastDate = potentialNewDate.getTime();
                LOG.info(
                        "{} lastDate changed from {} to {} based on mostRecentDateFound {}",
                        logIdprefix, oldDate, lastDate, mostRecentDateFound);
            } else {
                LOG.info(
                        "{} lastDate kept at {} based on mostRecentDateFound {}",
                        logIdprefix, lastDate, mostRecentDateFound);
            }
        }

        // change the date if we don't get any results at all
        if (numBuckets == 0) {
            lastDate = null;
        }

        // remove lock
        isInQuery.set(false);
    }

}