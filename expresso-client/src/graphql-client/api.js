import gql from "graphql-tag";
import client from "./client";

export const getBrand = async (name, domain, scoreBy) => {
  try {
    return await client.query({
      variables: { name, domain, scoreBy },
      query: gql`
        query($name: String!, $domain: DomainEnum, $scoreBy: String) {
          getBrand(name: $name, domain: $domain, scoreBy: $scoreBy) {
            totalCmt
            rate {
              average
              detail {
                rate
                domain
                totalCmt
              }
              rateCount {
                star
                totalCmt
              }
            }
          }
        }
      `
    });
  } catch (err) {
    return err;
  }
};

export const getComments = async ({
  offset,
  brand,
  star,
  domain,
  sort,
  keyword,
  from,
  to
}) => {
  try {
    return await client.query({
      variables: { offset, brand, star, sort, domain, keyword, from, to },
      query: gql`
        query(
          $offset: Int!
          $brand: String
          $star: String
          $sort: SortEnum
          $domain: DomainEnum
          $keyword: String
          $from: String!
          $to: String!
        ) {
          getComments(
            offset: $offset
            brand: $brand
            sort: $sort
            star: $star
            domain: $domain
            keyword: $keyword
            from: $from
            to: $to
          ) {
            total
            comments {
              id
              author
              content
              rate
              date
              sentimentStar
              product {
                source {
                  url
                }
              }
            }
          }
        }
      `
    });
  } catch (err) {
    return err;
  }
};

export const getHistogram = async ({
  brandName,
  from,
  to,
  interval,
  domain,
  scoreBy
}) => {
  try {
    return await client.query({
      variables: { brandName, from, to, interval, domain, scoreBy },
      query: gql`
        query(
          $brandName: String!
          $from: String!
          $to: String!
          $interval: Int!
          $domain: DomainEnum
          $scoreBy: String
        ) {
          brandHistogram(
            brandName: $brandName
            from: $from
            to: $to
            interval: $interval
            domain: $domain
            scoreBy: $scoreBy
          ) {
            timestamp
            total
            count {
              positive
              negative
            }
          }
        }
      `
    });
  } catch (err) {
    return err;
  }
};

export const getTopWords = async size => {
  try {
    return await client.query({
      variables: { size },
      query: gql`
        query($size: Int!) {
          getWords(size: $size) {
            text
            value
          }
        }
      `
    });
  } catch (err) {
    return err;
  }
};

export const getBrands = async title => {
  try {
    return await client.query({
      variables: { title },
      query: gql`
        query($title: String!) {
          getBrandsByProduct(title: $title) {
            name
            count
          }
        }
      `
    });
  } catch (err) {
    return err;
  }
};

export const brandAutocomplete = async keyword => {
  try {
    return await client.query({
      variables: { keyword },
      query: gql`
        query($keyword: String!) {
          brandCompletion(keyword: $keyword)
        }
      `
    });
  } catch (err) {
    return err;
  }
};

export const productAutocomplete = async keyword => {
  try {
    return await client.query({
      variables: { keyword },
      query: gql`
        query($keyword: String!) {
          productCompletion(keyword: $keyword)
        }
      `
    });
  } catch (err) {
    return err;
  }
};

export const getProductsByBrand = async (brand, title, offset) => {
  try {
    return await client.query({
      variables: { brand, title, offset },
      query: gql`
        query($brand: String!, $title: String!, $offset: Int!) {
          getProducts(brand: $brand, title: $title, offset: $offset) {
            total
            products {
              id
              title
              price
              source {
                domain
                url
              }
            }
          }
        }
      `
    });
  } catch (err) {
    return err;
  }
};

export const getAppStats = async () => {
  try {
    return await client.query({
      query: gql`
        query {
          getSummaryApp {
            brands_count
            comments_count
            products_count
            domain_count
          }
        }
      `
    });
  } catch (err) {
    return err;
  }
};

export const getPopuplarBrands = async () => {
  try {
    return await client.query({
      query: gql`
        query {
          getTopBrand {
            brands
            dealers
          }
        }
      `
    });
  } catch (err) {
    return err;
  }
};

export const getBadBrands = async () => {
  try {
    return await client.query({
      query: gql`
        query {
          getWorstBrand {
            brands
            dealers
          }
        }
      `
    });
  } catch (err) {
    return err;
  }
};

export const getFbPages = async (name, offset) => {
  try {
    return await client.query({
      variables: { name, offset },
      query: gql`
        query($name: String!, $offset: Int!) {
          getFacebookPage(name: $name, offset: $offset) {
            name
            url
            location
            likes_count
          }
        }
      `
    });
  } catch (err) {
    return err;
  }
};

export const getRanking = async ({ from, to, by }) => {
  try {
    return await client.query({
      variables: { from, to, by },
      query: gql`
        query($from: String, $to: String, $by: String) {
          getAllBrand(from: $from, to: $to, by: $by) {
            name
            totalCmts
            avg
            positive
            negative
          }
        }
      `
    });
  } catch (err) {
    return err;
  }
};

export const addLog = async ({ text, score, star, time }) => {
  try {
    return await client.mutate({
      variables: { text, score, star, time },
      mutation: gql`
        mutation($text: String!, $score: Float!, $star: Int!, $time: String!) {
          addLog(text: $text, score: $score, star: $star, time: $time)
        }
      `
    });
  } catch (err) {
    return err;
  }
};
